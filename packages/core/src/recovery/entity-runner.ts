import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { type AppError, format } from "../errors";
import type * as Logger from "../logger/logger";
import type { PredicateLookup } from "../predicates/expression";
import * as Retry from "../retry/retry";
import * as Machine from "../state-machine/machine";
import type { CommandCapabilities, WorkflowEnv } from "../workflow/interpreter";
import { interpretPipeline } from "../workflow/pipeline-interpreter";
import type { Workflow } from "../workflow/workflow";
import type { CompiledTripwire } from "./compile";
import * as TripwireMachine from "./tripwire-machine";

// -------------------------------------------------------------------------------------
// Elabora ogni tripwire di un'entità (es. un device) in base al proprio predicate,
// alla propria macchina a stati e al proprio logger.
//
// Ogni cambio di stato (incluso l'esito di un tentativo di recovery) passa da un solo canale:
// il `TransitionHook` passato a TripwireMachine.make (stesso meccanismo di
// machines/android-bridge/activity.ts#forwardToActivity) - niente diffing "prima/dopo" fatto
// a mano qui, niente side-channel che può arrivare fuori ordine.
// -------------------------------------------------------------------------------------

export interface EntityRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly workflows: readonly Workflow[];
  readonly capabilities: CommandCapabilities;
  readonly onStatus?: (tripwireIndex: number, state: TripwireMachine.TripwireState) => void;
}

export interface EntityRunner {
  readonly observe: (lookup: PredicateLookup, now: number) => Promise<void>;
  // Riarma un tripwire "exhausted"/"fatalError" (torna a `healthy`) sul presupposto che
  // l'operatore abbia risolto il problema fisico - il prossimo `observe` lo rivaluta da zero.
  // `false` se l'indice non corrisponde a nessun tripwire di questa entità.
  readonly reset: (tripwireIndex: number) => boolean;
}

interface TripwireInstance {
  readonly predicate: CompiledTripwire["predicate"];
  readonly machine: Machine.Machine<
    unknown,
    never,
    TripwireMachine.TripwireState,
    TripwireMachine.Event,
    TripwireMachine.RunRecovery
  >;
  readonly logger: Logger.Tagged;
  state: TripwireMachine.TripwireState;
}

// Messaggio leggibile per ogni transizione - solo per il log di servizio, non alimenta lo
// stato: `onStatus` riceve sempre lo stato intero, è lui a decidere cosa mostrare a valle.
const describeTransition = (from: TripwireMachine.TripwireState, to: TripwireMachine.TripwireState): string =>
  match(to)
    .with({ tag: "healthy" }, () => (from.tag === "recovering" ? "recovery succeeded" : "predicate healthy again"))
    .with({ tag: "pending" }, () => "predicate unhealthy, grace period started")
    .with({ tag: "recovering" }, () => "grace elapsed, running recovery pipeline")
    .with({ tag: "exhausted" }, () => "recovery exhausted retries without success")
    .with({ tag: "fatalError" }, (s) => `recovery pipeline failed: ${format(s.error)}`)
    .exhaustive();

export const create = (compiledTripwires: readonly CompiledTripwire[], env: EntityRunnerEnv): EntityRunner => {
  const workflowEnv: WorkflowEnv = {
    logger: env.logger,
    capabilities: env.capabilities,
    workflows: env.workflows,
  };

  const instances: TripwireInstance[] = compiledTripwires.map((tripwire, index) => {
    const tripwireLogger = env.logger.child(`Recovery-Tripwire:${index}`);

    // Il predicate va ricontrollato dopo la pipeline: "succeeded" nella pipeline significa solo che
    // i comandi sono stati eseguiti senza errori, non che il device sia di nuovo sano (es. reboot
    // inviato con successo ma device non ancora tornato raggiungibile) - per questo il lookup, con
    // cui si rivaluta il predicate, arriva ad ogni tentativo invece di essere catturato una volta sola.
    const runRecoveryFor = (lookup: PredicateLookup): TE.TaskEither<AppError, boolean> =>
      Retry.retryingUntil(
        tripwire.retryPolicy,
        tripwireLogger,
      )(
        pipe(
          interpretPipeline(tripwire.pipeline)(workflowEnv),
          TE.map((ranOk) => ({ ranOk, recovered: ranOk && tripwire.predicate(lookup) })),
          TE.tapIO(({ ranOk, recovered }) =>
            ranOk && !recovered
              ? tripwireLogger.warn("recovery pipeline completed successfully, but predicate is still false")
              : () => {},
          ),
          TE.map(({ recovered }) => recovered),
        ),
      );

    const onTransition: Machine.TransitionHook<unknown, never, TripwireMachine.TripwireState, TripwireMachine.Event> =
      (from, _event, to) => () => {
        if (from.tag === to.tag) return TE.right(undefined);

        tripwireLogger.info(describeTransition(from, to))();
        env.onStatus?.(index, to);
        return TE.right(undefined);
      };

    const machine = TripwireMachine.make(tripwire.graceMs, runRecoveryFor, onTransition);

    return { predicate: tripwire.predicate, machine, logger: tripwireLogger, state: TripwireMachine.initial };
  });

  const observe = async (lookup: PredicateLookup, now: number): Promise<void> => {
    for (const instance of instances) {
      const healthy = instance.predicate(lookup);
      const result = await Machine.dispatch(instance.machine)(instance.state, {
        tag: "observe",
        healthy,
        now,
        lookup,
      })(undefined)();

      // Err = never per la macchina del tripwire (vedi tripwire-machine.ts#makeHandler): un
      // vero errore della pipeline è oggi una transizione fatalError (un Right), non più un
      // Left del dispatch - questo ramo non dovrebbe più essere raggiungibile, resta solo come
      // rete di sicurezza difensiva.
      if (E.isRight(result)) {
        instance.state = result.right;
      } else {
        instance.logger.error(`dispatch failed unexpectedly: ${format(result.left)}`)();
      }
    }
  };

  const reset = (tripwireIndex: number): boolean => {
    const instance = instances[tripwireIndex];
    if (!instance) return false;

    const previous = instance.state;
    instance.state = TripwireMachine.initial;
    if (previous.tag !== "healthy") env.onStatus?.(tripwireIndex, TripwireMachine.initial);
    return true;
  };

  return { observe, reset };
};
