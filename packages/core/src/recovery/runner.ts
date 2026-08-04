import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import { format } from "../errors";
import type { FactEntry, FactValue } from "../fact/model";
import type { FactFeed } from "../fact/stream";
import * as Logger from "../logger/logger";
import type { PolicyDecodeError } from "../retry/codec";
import type { Policy } from "../retry/retry";
import * as TaskRunner from "../task-runner";
import type { Commands } from "../workflow/interpreter";
import type { Probes } from "../workflow/probe";
import type { Workflow } from "../workflow/workflow";
import { type CompiledTripwire, compileTripwires } from "./compile";
import * as EntityRunner from "./entity-runner";
import type { RecoveryPolicy } from "./model";
import type * as TripwireMachine from "./tripwire-machine";

// Multi-entity orchestration: observes PredicateFeed, filters by policy domain, creates EntityRunner per entity

export interface RecoveryRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly stream: FactFeed;
  readonly workflows: readonly Workflow[];
  readonly commandsFor: (entityId: string) => Commands;
  readonly probesFor?: (entityId: string) => Probes;
  // Tick rate for re-observation (detects grace period expiry without new facts)
  readonly tickPolicy: Policy;
  // Loop identity for dashboard; one per RecoveryPolicy, not aggregated
  readonly descriptor: TaskRunner.LoopDescriptor;
  readonly loopStream?: TaskRunner.LoopStream;
  readonly now?: () => number;
  // Optional notification on each tripwire transition (full state, not a side-channel)
  readonly onStatus?: (entityId: string, tripwireIndex: number, state: TripwireMachine.TripwireState) => void;
}

export interface RecoveryRunnerHandle {
  readonly stop: () => void;
  // Rearm tripwire after exhaustion (returns false if entity never observed)
  readonly rearm: (entityId: string, tripwireIndex: number) => boolean;
}

export const start = (
  policy: RecoveryPolicy,
  env: RecoveryRunnerEnv,
): E.Either<PolicyDecodeError, RecoveryRunnerHandle> =>
  pipe(
    compileTripwires(policy.tripwires),
    E.map((compiledTripwires: readonly CompiledTripwire[]) => {
      const now = env.now ?? Date.now;
      const factsByEntity = new Map<string, Map<string, FactValue>>();
      const runnersByEntity = new Map<string, EntityRunner.EntityRunner>();

      const runnerFor = (entityId: string): EntityRunner.EntityRunner => {
        const existing = runnersByEntity.get(entityId);
        if (existing) return existing;

        const created = EntityRunner.create(compiledTripwires, {
          logger: env.logger.child(entityId),
          workflows: env.workflows,
          commands: env.commandsFor(entityId),
          probes: env.probesFor?.(entityId),
          onStatus: env.onStatus && ((tripwireIndex, state) => env.onStatus!(entityId, tripwireIndex, state)),
        });
        runnersByEntity.set(entityId, created);
        return created;
      };

      const lookupFor =
        (entityId: string) =>
        (name: string): FactValue | undefined =>
          factsByEntity.get(entityId)?.get(name);

      const observeEntity = async (entityId: string): Promise<void> => {
        await runnerFor(entityId).observe(lookupFor(entityId), now());
      };

      // Detached observation: callers can't wait for recovery pipelines; catch prevents silent loop death
      const observeDetached = (entityId: string): void => {
        void observeEntity(entityId).catch((error) =>
          env.logger.error(`Recovery policy "${policy.label}": observe failed - ${format(error)}`)(),
        );
      };

      const applyEntry = (entry: FactEntry): void => {
        if (entry.domain !== policy.domain) return;

        const facts = factsByEntity.get(entry.entityId) ?? new Map<string, FactValue>();
        facts.set(entry.name, entry.value);
        factsByEntity.set(entry.entityId, facts);
      };

      for (const entry of env.stream.snapshot()) applyEntry(entry);

      const unsubscribe = env.stream.subscribe((entry) => {
        if (entry.domain !== policy.domain) return;

        applyEntry(entry);
        observeDetached(entry.entityId);
      });

      const tickLoop = TaskRunner.create({
        logger: Logger.muted(env.logger.child(`RecoveryRunner:${policy.label}`)),
        descriptor: env.descriptor,
        policy: env.tickPolicy,
        loopStream: env.loopStream,
        // Il tick è l'unico meccanismo che fa scattare un grace ormai scaduto: il predicate
        // feed emette solo sui cambi di valore, quindi un predicate rimasto falso non produce
        // più nulla dopo il primo fatto. Per questo le osservazioni non vengono attese -
        // attenderle bloccherebbe il tick per tutta la durata di una pipeline di recovery
        // (minuti), congelando proprio il timer che deve farla scattare, oltre alle altre
        // entità della stessa policy. Ri-osservare un tripwire già in `recovering` è un no-op.
        onTick: async () => {
          for (const entityId of factsByEntity.keys()) observeDetached(entityId);
          return E.right(undefined);
        },
      });

      // Avvia il loop in background
      pipe(tickLoop.start, TaskRunner.detach)();

      return {
        stop: () => {
          unsubscribe();
          tickLoop.stop();
        },
        rearm: (entityId, tripwireIndex) => runnersByEntity.get(entityId)?.rearm(tripwireIndex) ?? false,
      };
    }),
  );
