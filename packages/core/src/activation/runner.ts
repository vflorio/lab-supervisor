import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { type AppError, fromUnknown } from "../errors";
import type * as Logger from "../logger";
import * as Retry from "../retry/retry";
import * as Schedule from "../schedule";

// -------------------------------------------------------------------------------------
// Activation Runner
// Questo modulo opera a runtime per determinare quando il processo entra nella sua
// fase di lavoro attiva (per evitare di avvivarsi fuori dall'orario previsto)
// Utilizza uno Schedule come predicato di attivazione
// e una Retry.Policy per determinare il delay tra i tick.
// -------------------------------------------------------------------------------------

export interface StartError extends AppError<"StartError"> {}

// Esegue `onActive` quando lo schedule e' attivo, `onInactive` quando non lo e'.
// Usa la policy per determinare il delay tra i tick.
// Ritorna un handle con `abort` per fermare il loop.
export const create = (
  log: Logger.Tagged,
  // Questo schedule contiene il range di operatività
  activationGate: Schedule.Schedule,
  // Policy di polling per determinare il delay tra i tick
  policy: Retry.Policy,
  // Status change, vengono chiamati ad ogni tick
  {
    onActive = T.of(void 0),
    onInactive = T.of(void 0),
  }: {
    onActive?: T.Task<void>;
    onInactive?: T.Task<void>;
  },
) => {
  const controller = new AbortController();

  let status: Retry.Status = Retry.initialStatus;
  let wasInActivationSchedule = false;

  const tick = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    const now = new Date();
    const slot = Schedule.toTimeSlot(now);
    const isActive = activationGate(slot);

    if (isActive && !wasInActivationSchedule) {
      log.info("Service ACTIVE - entering work schedule")();
      wasInActivationSchedule = true;
    }

    if (!isActive && wasInActivationSchedule) {
      log.info("Service IDLE - outside work schedule")();
      wasInActivationSchedule = false;
    }

    if (isActive) {
      await onActive();
    } else {
      await onInactive();
    }

    // Calcola il delay dalla policy
    const delay = policy(status);
    if (delay === null) {
      log.info("Polling policy exhausted - stopping")();
      return;
    }

    status = { iteration: status.iteration + 1, previousDelay: delay };

    await sleep(delay);

    return tick();
  };

  return {
    start: TE.tryCatch(() => tick(), fromUnknown("StartError")),
    stop: pipe(
      log.info("Scheduled runner stopped"),
      IO.flatMap(() => () => controller.abort()),
    ),
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
