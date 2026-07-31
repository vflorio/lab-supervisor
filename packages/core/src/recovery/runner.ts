import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import { format } from "../errors";
import * as Logger from "../logger/logger";
import type { PredicateEntry, PredicateFeed, PredicateValue } from "../predicates/index";
import type { PolicyDecodeError } from "../retry/codec";
import type { Policy } from "../retry/retry";
import * as TaskRunner from "../task-runner";
import type { CommandCapabilities } from "../workflow/interpreter";
import type { Workflow } from "../workflow/workflow";
import { type CompiledTripwire, compileTripwires } from "./compile";
import * as EntityRunner from "./entity-runner";
import type { RecoveryPolicy } from "./model";
import type * as TripwireMachine from "./tripwire-machine";

// Orchestrazione multi-entità: osserva il PredicateFeed dal vivo, filtra per il dominio della
// policy, crea un EntityRunner per ogni entityId incontrato e lo guida sia sui cambi di
// predicato sia su un tick periodico (per rilevare un grace period scaduto anche senza nuovi fatti).

export interface RecoveryRunnerEnv {
  readonly logger: Logger.Tagged;
  readonly stream: PredicateFeed;
  readonly workflows: readonly Workflow[];
  readonly capabilitiesFor: (entityId: string) => CommandCapabilities;
  // Cadenza del tick periodico di ri-osservazione (per rilevare grace scaduti senza nuovi fatti)
  readonly tickPolicy: Policy;
  // Identità del tick loop per la dashboard (§7): un loop per RecoveryPolicy, non un
  // aggregato - ognuno il proprio widget, non un merge.
  readonly descriptor: TaskRunner.LoopDescriptor;
  readonly loopStream?: TaskRunner.LoopStream;
  readonly now?: () => number;
  // Notifica opzionale ad ogni transizione di un tripwire, per un'entità - lo stato intero
  // (incluso l'esito di un tentativo di recovery, non più un side-channel separato)
  readonly onStatus?: (entityId: string, tripwireIndex: number, state: TripwireMachine.TripwireState) => void;
}

export interface RecoveryRunnerHandle {
  readonly stop: () => void;
  // Riarma il tripwire di un'entità dopo un esaurimento dei retry - vedi EntityRunner.reset.
  // `false` se l'entità non è mai stata osservata da questo runner (nessun EntityRunner creato).
  readonly reset: (entityId: string, tripwireIndex: number) => boolean;
}

export const start = (
  policy: RecoveryPolicy,
  env: RecoveryRunnerEnv,
): E.Either<PolicyDecodeError, RecoveryRunnerHandle> =>
  pipe(
    compileTripwires(policy.tripwires),
    E.map((compiledTripwires: readonly CompiledTripwire[]) => {
      const now = env.now ?? Date.now;
      const factsByEntity = new Map<string, Map<string, PredicateValue>>();
      const runnersByEntity = new Map<string, EntityRunner.EntityRunner>();

      const runnerFor = (entityId: string): EntityRunner.EntityRunner => {
        const existing = runnersByEntity.get(entityId);
        if (existing) return existing;

        const created = EntityRunner.create(compiledTripwires, {
          logger: env.logger.child(entityId),
          workflows: env.workflows,
          capabilities: env.capabilitiesFor(entityId),
          onStatus: env.onStatus && ((tripwireIndex, state) => env.onStatus!(entityId, tripwireIndex, state)),
        });
        runnersByEntity.set(entityId, created);
        return created;
      };

      const lookupFor =
        (entityId: string) =>
        (name: string): PredicateValue | undefined =>
          factsByEntity.get(entityId)?.get(name);

      const observeEntity = async (entityId: string): Promise<void> => {
        await runnerFor(entityId).observe(lookupFor(entityId), now());
      };

      // Osservazione detached: `observe` resta in volo per tutta la durata di un'eventuale
      // pipeline di recovery, e nessuno dei due chiamanti (feed e tick) può permettersi di
      // aspettarla. Il catch non è difensivo per abitudine: una promise rejected qui
      // ucciderebbe silenziosamente il loop che la lancia.
      const observeDetached = (entityId: string): void => {
        void observeEntity(entityId).catch((error) =>
          env.logger.error(`Recovery policy "${policy.label}": observe failed - ${format(error)}`)(),
        );
      };

      const applyEntry = (entry: PredicateEntry): void => {
        if (entry.domain !== policy.domain) return;

        const facts = factsByEntity.get(entry.entityId) ?? new Map<string, PredicateValue>();
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
        reset: (entityId, tripwireIndex) => runnersByEntity.get(entityId)?.reset(tripwireIndex) ?? false,
      };
    }),
  );
