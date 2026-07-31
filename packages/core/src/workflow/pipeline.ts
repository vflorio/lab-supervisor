// Pipeline: compone workflow interi tramite and/or/not, sullo stile di fp-ts/Predicate ma
// generalizzato a un contesto effettuale (I/O, retry esterno):
// - "or"  = prova il primo, se fallisce prova il successivo -> escalation
// - "and" = tutti devono risolvere true, in sequenza -> richiesta congiunta
// - "not" = inverte l'esito
// Come un Workflow, ritorna `true` per la strada buona e `false` per quella cattiva - un
// `Left` è riservato a errori di configurazione reali, non a un tentativo fallito.
//
// Attenzione a cosa significa quel booleano: è l'esito dei *comandi*, non del problema. Un ramo
// fatto di soli comandi device "riesce" appena l'ADB non fallisce, anche se il device è rimasto
// rotto - e un `or` così non escala mai. Perché l'escalation abbia senso, un ramo deve
// terminare con `awaitPredicate` (vedi ./workflow.ts): è quello a trasformare "ho eseguito" in
// "ha guarito".

export type Pipeline =
  | { readonly type: "workflow"; readonly workflowName: string }
  | { readonly type: "and"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "or"; readonly pipelines: readonly Pipeline[] }
  | { readonly type: "not"; readonly pipeline: Pipeline };
