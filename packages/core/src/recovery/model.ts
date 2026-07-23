import type { DurationString } from "../date-time";
import type { PredicateExpr } from "../predicates/expr";
import type { PolicyJson } from "../retry/codec";
import type { Pipeline } from "../workflow/pipeline";

// -------------------------------------------------------------------------------------
// Model - Recovery: un livello di recovery ha una condizione di trigger (predicate,
// vera = strada buona), una tolleranza prima di agire (grace), cosa eseguire quando
// il predicate resta falso oltre grace (pipeline) e con quale policy ritentare (retry).
//
// Più livelli (levels) formano un'unica policy nominata (label) - i livelli sono ordinati
// per grace crescente e rappresentano un'escalation: condizioni/azioni diverse man mano
// che il tempo passa, non un semplice retry dello stesso identico livello.
//
// Nessun interprete/motore qui: solo il modello. L'esecuzione dal vivo (osservare i
// predicati, far scattare i grace period, guidare l'escalation) resta un passo successivo,
// presumibilmente sopra state-machine/machine.ts.
// -------------------------------------------------------------------------------------

export interface RecoveryLevel {
  readonly grace: DurationString;
  readonly predicate: PredicateExpr;
  readonly pipeline: Pipeline;
  readonly retry: PolicyJson;
}

export interface RecoveryPolicy {
  readonly label: string;
  readonly levels: readonly RecoveryLevel[];
}
