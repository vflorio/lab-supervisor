import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import * as Errors from "./errors";
import * as Logger from "./logger/logger";
import * as Retry from "./retry/retry";

// Motore minimale per un ciclo `onTick` a cadenza guidata da una Retry.Policy, senza alcuna
// nozione di schedule/orario di lavoro: un tracker di monitoring deve poter girare in continuo.

export interface StartError extends Errors.AppError<"StartError"> {}

export interface Handle {
  readonly start: TE.TaskEither<StartError, void>;
  readonly stop: IO.IO<void>;
}

// Esegue `onTick` ripetutamente, con delay tra i tick determinato dalla policy.
// Si ferma se la policy è esaurita (torna null) - per le policy di tracking questo non
// dovrebbe mai accadere in pratica (constantDelay/exponentialBackoff+capDelay, senza limitRetries),
// stessa convenzione già in uso per `monitoring.polling`.
export const create = (
  logger: Logger.Tagged,
  policy: Retry.Policy,
  onTick: () => void | Promise<void>,
  jobLabel?: string,
): Handle => {
  const controller = new AbortController();

  const pilLogger = logger.child("Interval-Loop");

  let status: Retry.Status = Retry.initialStatus;

  const formattedJobLabel = `Job: ${jobLabel || "Unknown "}`;

  const tick = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    await onTick();

    const delay = policy(status);
    if (delay === null) {
      pilLogger.info(`${formattedJobLabel} exhausted - stopping`)();
      return;
    }

    status = { iteration: status.iteration + 1, previousDelay: delay };

    pilLogger.debug(`${formattedJobLabel} - Tick: ${status.iteration} - Next delay: ${Logger.formatMs(delay)}`)();

    await sleep(delay);

    return tick();
  };

  return {
    start: pipe(
      TE.fromIO(pilLogger.info(`Starting ${formattedJobLabel}`)),
      TE.flatMap(() => TE.tryCatch(() => tick(), Errors.fromUnknown("StartError"))),
    ),
    stop: pipe(
      pilLogger.info(`Stopping ${formattedJobLabel}`),
      IO.flatMap(() => () => controller.abort()),
    ),
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Detach: esegue un TaskEither in background, senza attendere il risultato
export const detach =
  <A>(task: TE.TaskEither<Errors.AppError<any>, A>): IO.IO<void> =>
  () => {
    void task();
  };
