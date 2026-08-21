// Il servizio come oggetto: si crea, si avvia, si ferma. Tutto ciò che sta sopra — segnali, exit
// code, lettura del file — è `index.ts`, e sta fuori apposta: così il servizio intero si può
// montare in un test e guidare a mano, che è l'unico modo per verificare un composition root.
// Due tempi indipendenti, ed è il punto della faccenda: le sonde girano al loro passo, le sessioni
// al loro. Un tick del recupero che aspettasse le sonde erediterebbe la loro latenza (FATTO-12), e
// una sonda che aspettasse un reboot in corso smetterebbe di osservare il resto del lab.

import * as Clock from "@lab/kernel/Clock";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import * as Bootstrap from "./Bootstrap";
import type { Config } from "./config/Config";
import * as MonitoringLoop from "./drivers/MonitoringLoop";
import * as RecoveryLoop from "./drivers/RecoveryLoop";
import * as Ticker from "./drivers/Ticker";
import type { AppEnv } from "./Environment";
import * as Environment from "./Environment";
import type { Logger } from "./Logger";

export interface Supervisor {
  readonly start: () => void;
  readonly stop: () => void;
  // Un giro di ciascun ciclo, aspettandolo. Il servizio in produzione non li chiama: li chiama chi
  // lo mette alla prova, per far succedere in un test ciò che nel lab succede ogni venti secondi.
  readonly observeOnce: () => Promise<void>;
  readonly tickOnce: () => Promise<void>;
  readonly env: AppEnv;
  readonly stores: Environment.Environment["stores"];
}

export const create = (
  config: Config,
  logger: Logger,
  substitutes: Environment.Substitutes = {},
): TE.TaskEither<Bootstrap.BootstrapError, Supervisor> => {
  const { env, stores } = Environment.make(config, logger, substitutes);

  // Il canale d'errore delle porte è `never` (A-6): un guasto dell'hardware è un esito che il
  // dominio registra, non un'eccezione che risale. Se qui arrivasse una `Left`, sarebbe un difetto
  // del montaggio, non del lab.
  const run = async <A>(action: RTE.ReaderTaskEither<AppEnv, never, A>): Promise<A> => {
    const result = await action(env)();
    if (E.isLeft(result)) throw new Error(`il canale d'errore è never: ${JSON.stringify(result.left)}`);
    return result.right;
  };

  const recovery = RecoveryLoop.make(config, logger.child("Recovery"));
  const monitoringLogger = logger.child("Monitoring");

  const onError = (where: string) => (error: unknown) =>
    logger.error(`giro di ${where} interrotto: ${error instanceof Error ? error.message : String(error)}`);

  // Un giro logga solo alla fine, perché è alla fine che il modello consegna i suoi eventi. Senza
  // queste due righe un giro appeso su adb — che può durare quanto il suo timeout (FATTO-12) — è
  // indistinguibile da un servizio morto.
  const timed = (where: string, cycle: () => Promise<unknown>) => async (): Promise<void> => {
    const startedAt = Date.now();
    logger.debug(`giro di ${where}: inizio`);
    await cycle();
    logger.debug(`giro di ${where}: fine in ${Date.now() - startedAt}ms`);
  };

  const probes = Ticker.make({
    interval: config.monitoring.probeInterval,
    immediate: true,
    task: timed("osservazione", () => run(MonitoringLoop.execute(config.monitoring.flapping, monitoringLogger))),
    onError: onError("osservazione"),
  });

  const sessions = Ticker.make({
    interval: config.recovery.tickInterval,
    task: timed("recupero", () => run(recovery.cycle)),
    onError: onError("recupero"),
  });

  return pipe(
    TE.fromTask(() => run(Clock.now)),
    TE.flatMap((now) => Bootstrap.execute(config, now)(env)),
    TE.map((): Supervisor => {
      logger.info(
        `anagrafica: ${config.devices.length} device · profili: ${config.profiles.map((profile) => profile.kind).join(", ")}`,
      );
      return {
        env,
        stores,
        observeOnce: probes.runOnce,
        tickOnce: sessions.runOnce,
        start: () => {
          logger.info(
            `avvio · sonde ogni ${config.monitoring.probeInterval}ms · sessioni ogni ${config.recovery.tickInterval}ms`,
          );
          probes.start();
          sessions.start();
        },
        stop: () => {
          probes.stop();
          sessions.stop();
          logger.info("fermato");
        },
      };
    }),
  );
};
