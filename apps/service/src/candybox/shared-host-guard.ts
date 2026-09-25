import * as Ssh from "@supervisor/core/adapters/ssh";
import * as SharedHost from "@supervisor/core/candybox/shared-host";
import * as DateTime from "@supervisor/core/date-time";
import * as Errors from "@supervisor/core/errors";
import * as Facts from "@supervisor/core/fact/index";
import type * as Logger from "@supervisor/core/logger/logger";
import * as RetryCodec from "@supervisor/core/retry/codec";
import type * as Shell from "@supervisor/core/shell";
import * as TaskRunner from "@supervisor/core/task-runner/index";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as Registry from "../registry";
import * as SuitestDevice from "../suitest/suitest-device";

// Ogni tick prende la topologia dal registry, e lo status corrente dei device dal fact stream.
// Se tutti i device di uno stesso Candybox sono OFFLINE ne forza il reboot via SSH.

// Intervallo e cooldown non sono in config (loop minimale, come l'AndroidBridge reconciler).
const CHECK_POLICY = RetryCodec.describedConstant(DateTime.durationToMs("1m"));

// Un Candybox appena riavviato resta con i device OFFLINE per minuti mentre fa il boot: senza
// cooldown il tick successivo lo riavvierebbe di nuovo, all'infinito (reboot loop).
const REBOOT_COOLDOWN_MS = DateTime.durationToMs("15m");

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly registryEnv: Registry.RegistrySyncEnv;
  readonly factStream: Facts.FactFeed;
  readonly sshUser: string;
  readonly spawn: Shell.Spawn;
  readonly loopStream?: TaskRunner.LoopStream;
}

export const create = (deps: Deps): TaskRunner.Handle => {
  const log = deps.logger.child("Candybox").child("SharedHost");
  const sshEnv: Ssh.SshEnv = { logger: log.child("SSH"), spawn: deps.spawn };

  // Status corrente di un device dal fact stream (live), None se nessun fatto ancora osservato.
  const statusOf = (deviceId: string): string | undefined => {
    const value = Facts.lookupFor(deps.factStream, SuitestDevice.DOMAIN, deviceId)(SuitestDevice.STATUS);
    return typeof value === "string" ? value : undefined;
  };

  const lastRebootAt = new Map<string, number>();

  const notInCooldown = (target: SharedHost.StuckCandybox): boolean =>
    Date.now() - (lastRebootAt.get(target.id) ?? 0) >= REBOOT_COOLDOWN_MS;

  // Un reboot fallito viene loggato ma non fa fallire il tick né blocca gli altri Candybox.
  const rebootOne = (target: SharedHost.StuckCandybox): TE.TaskEither<never, boolean> =>
    TE.fromTask(
      pipe(
        Ssh.reboot(Ssh.target(deps.sshUser, target.host))(sshEnv),
        TE.match(
          (error) => {
            log.error(`Reboot of "${target.label}" (${target.host.ip}) failed: ${Errors.format(error)}`)();
            return false;
          },
          () => {
            lastRebootAt.set(target.id, Date.now());
            log.warn(`All devices OFFLINE for "${target.label}" (${target.host.ip}) - reboot dispatched via SSH`)();
            return true;
          },
        ),
      ),
    );

  const onTick: TE.TaskEither<Errors.AppError, string | undefined> = pipe(
    Registry.read(deps.registryEnv),
    TE.map((db) => SharedHost.detectStuckCandyboxes(db.lab.candyboxes, Object.values(db.suitest.devices), statusOf)),
    TE.map((targets) => targets.filter(notInCooldown)),
    TE.flatMap((targets) =>
      pipe(
        targets,
        TE.traverseSeqArray(rebootOne),
        TE.map((results) => results.filter(Boolean).length),
      ),
    ),
    TE.map((rebooted) => `${rebooted} candybox reboot(s) triggered`),
  );

  return TaskRunner.create({
    logger: log,
    descriptor: {
      id: "candybox:shared-host",
      label: "Candybox - Shared-host recovery",
      policyLabel: CHECK_POLICY.label,
    },
    policy: CHECK_POLICY.policy,
    onTick,
    loopStream: deps.loopStream,
  });
};
