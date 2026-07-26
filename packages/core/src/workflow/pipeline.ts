// -------------------------------------------------------------------------------------
// Model - Pipeline: compone workflow interi tramite and/or/not, sullo stile di
// fp-ts/Predicate (and/or/not), generalizzato a un contesto effettuale (I/O, retry esterno).
//
// Sostituisce le vecchie "strategies" primary/secondary di Workflow:
// - "or"  = prova il primo, se fallisce (torna false) prova il successivo -> escalation
// - "and" = tutti devono risolvere true, in sequenza -> concatenazione/richiesta congiunta
// - "not" = inverte l'esito
//
// Per convenzione un Pipeline (come un Workflow) ritorna `true` per la strada buona e
// `false` per quella cattiva - un `Left` è riservato a errori di configurazione reali
// (es. un riferimento a un workflow inesistente), non a un tentativo di recovery fallito.
// -------------------------------------------------------------------------------------

export type Pipeline =
  | { readonly type: "workflow"; readonly workflowName: string }
  | { readonly type: "and"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "or"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "not"; readonly pipeline: Pipeline };
