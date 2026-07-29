import type { DurationString } from "../date-time";
import type { NotifyRule } from "../notify/model";
import type { PredicateExpression } from "../predicates/expression";
import type { PolicyJson } from "../retry/codec";
import type { Pipeline } from "../workflow/pipeline";

// Un livello di recovery ha una condizione di trigger (predicate, vera = strada buona), una
// tolleranza prima di agire (grace), cosa eseguire quando il predicate resta falso oltre
// grace (pipeline) e con quale policy ritentare (retry). Più livelli (tripwires) formano
// un'unica policy nominata (label), ordinati per grace crescente: un'escalation, non un
// semplice retry dello stesso livello. Nessun interprete/motore qui, solo il modello.

export interface RecoveryTripwire {
  readonly grace: DurationString;
  readonly predicate: PredicateExpression;
  readonly pipeline: Pipeline;
  readonly retry: PolicyJson;
  readonly notify?: readonly NotifyRule[];
}

export interface RecoveryPolicy {
  readonly label: string;
  // Dominio tracciato (es. "adb" | "suitest-camera" | ...) a cui la policy si applica;
  // il motore a runtime la esegue per ogni entityId visto in quel dominio.
  readonly domain: string;
  readonly tripwires: readonly RecoveryTripwire[];
}
