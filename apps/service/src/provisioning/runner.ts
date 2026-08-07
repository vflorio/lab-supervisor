import type * as Activity from "@supervisor/core/activity/stream";
import * as AdbProvisioning from "@supervisor/core/adapters/adb/provisioning";
import type * as Adb from "@supervisor/core/adapters/adb/shell";
import type * as ConfigModel from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import type * as Facts from "@supervisor/core/fact/index";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as Provisioning from "@supervisor/core/provisioning/model";
import type * as Shell from "@supervisor/core/shell";
import { pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
// Convergente: legge stato, applica passi mancanti, rilegge. Non distruttivo come lo script.

export interface ProvisioningError extends Errors.AppError<"ProvisioningError"> {}

export type Error = Adb.Error | ProvisioningError;

// Pairing ha tap fisico; 3 passate coprono install-grant-launch anche con firma incompatibile
const MAX_PASSES = 3;

// `am start` ritorna subito; attesa perché rilettura veda servizio in foreground
const SETTLE_MS = 3_000;

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
  readonly config: O.Option<ConfigModel.Provisioning>;
  readonly factStream: Facts.FactStream;
  readonly activityStream: Activity.ActivityStream;
}

export interface Handle {
  // Legge lo stato e pubblica i fatti, senza toccare il device.
  readonly refresh: (target: Network.Endpoint) => TE.TaskEither<Error, AdbProvisioning.AgentStatus>;
  // Converge il device allo stato provisionato. Lanciata a mano dalla UI: nessun poll la invoca.
  readonly provision: (target: Network.Endpoint) => TE.TaskEither<Error, AdbProvisioning.AgentStatus>;
  readonly isConfigured: boolean;
}

const notConfigured: ProvisioningError = Errors.of("ProvisioningError")(
  "Provisioning non configurato: manca la sezione `provisioning` nella config del servizio",
);

export const create = ({ logger, spawn, config, factStream, activityStream }: Deps): Handle => {
  const adbEnv: Adb.AdbEnv = { logger: logger.child("ADB"), spawn };

  const withConfig = <A>(
    use: (settings: ConfigModel.Provisioning) => TE.TaskEither<Error, A>,
  ): TE.TaskEither<Error, A> =>
    pipe(
      config,
      O.match((): TE.TaskEither<Error, A> => TE.left(notConfigured), use),
    );

  // Indicizzato per target ADB (come dominio `adb`), non per ruolo camera
  const publish = (target: Network.Endpoint, status: AdbProvisioning.AgentStatus) =>
    Provisioning.factsFor(Network.format(target), status).forEach(factStream.emit);

  const activity = (target: Network.Endpoint, status: string): void =>
    activityStream.emit({ entityId: Network.format(target), source: "provisioning", status });

  const readStatus = (
    settings: ConfigModel.Provisioning,
    target: Network.Endpoint,
  ): TE.TaskEither<Error, AdbProvisioning.AgentStatus> =>
    pipe(
      AdbProvisioning.readAgentStatus(settings.packageId)(target)(adbEnv),
      TE.tapIO((status) => () => publish(target, status)),
    );

  const runStep = (
    settings: ConfigModel.Provisioning,
    target: Network.Endpoint,
    step: Provisioning.Step,
  ): TE.TaskEither<Error, void> =>
    pipe(
      TE.fromIO(logger.info(`${Network.format(target)}: ${Provisioning.stepLabel(step)}`)),
      TE.flatMap(() =>
        match(step)
          .with({ _tag: "Install" }, () =>
            AdbProvisioning.installOrReplace(settings.apkPath, settings.packageId)(target)(adbEnv),
          )
          .with({ _tag: "Grant" }, () => AdbProvisioning.grantWriteSecureSettings(settings.packageId)(target)(adbEnv))
          .with({ _tag: "ExemptDoze" }, () => AdbProvisioning.exemptFromDoze(settings.packageId)(target)(adbEnv))
          .with({ _tag: "LaunchOnce" }, () =>
            AdbProvisioning.launchAgent(settings.packageId, settings.activity)(target)(adbEnv),
          )
          .exhaustive(),
      ),
      TE.map(() => undefined),
    );

  // Ogni passata applica solo passi mancanti; rilettura determina se sufficienti
  const converge =
    (settings: ConfigModel.Provisioning, target: Network.Endpoint, pass: number) =>
    (status: AdbProvisioning.AgentStatus): TE.TaskEither<Error, AdbProvisioning.AgentStatus> => {
      if (Provisioning.isHealthy(status)) return TE.right(status);

      if (pass >= MAX_PASSES) {
        const failed = Provisioning.CHECKS.filter((check) => !check.read(status)).map((check) => check.label);
        return TE.left(
          Errors.of("ProvisioningError")(`Provisioning incompleto dopo ${pass} passate - manca: ${failed.join(", ")}`),
        );
      }

      const steps = Provisioning.plan(status, O.fromNullable(settings.versionCode));

      // Rete di sicurezza: `plan` produce sempre un passo per stato non sano
      if (steps.length === 0) {
        return TE.left(Errors.of("ProvisioningError")("Stato non sano ma nessun passo applicabile"));
      }

      const needsSettle = steps.some((step) => step._tag === "LaunchOnce");

      return pipe(
        TE.traverseSeqArray((step: Provisioning.Step) => runStep(settings, target, step))(steps),
        TE.flatMap(() =>
          needsSettle ? pipe(readStatus(settings, target), T.delay(SETTLE_MS)) : readStatus(settings, target),
        ),
        TE.flatMap(converge(settings, target, pass + 1)),
      );
    };

  return {
    isConfigured: O.isSome(config),

    refresh: (target) => withConfig((settings) => readStatus(settings, target)),

    provision: (target) =>
      withConfig((settings) =>
        pipe(
          TE.fromIO(logger.info(`Provisioning started for ${Network.format(target)}`)),
          TE.tapIO(() => () => activity(target, "provisioning")),
          TE.flatMap(() => readStatus(settings, target)),
          TE.flatMap(converge(settings, target, 1)),
          TE.tapIO((status) =>
            pipe(
              () => activity(target, "provisioned"),
              IO.flatMap(() =>
                logger.info(
                  `Provisioning completed for ${Network.format(target)} (versionCode ${pipe(
                    status.versionCode,
                    O.map(String),
                    O.getOrElse(() => "unknown"),
                  )})`,
                ),
              ),
            ),
          ),
          TE.orElseFirstIOK((error) =>
            pipe(
              () => activity(target, "failed"),
              IO.flatMap(() =>
                logger.error(`Provisioning failed for ${Network.format(target)}: ${Errors.format(error)}`),
              ),
            ),
          ),
        ),
      ),
  };
};
