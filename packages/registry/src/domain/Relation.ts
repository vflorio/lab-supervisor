// L'unica distinzione che salva dal riavviare la ControlUnit sbagliata.
// `DependsOn`: se il genitore cade, il figlio è irraggiungibile di conseguenza (FATTO-4) — è
// l'arco che la correlazione attraversa (INV-11).
// `Observes`: il figlio guarda il genitore ma non ne dipende (FATTO-3) — una camera sopravvive
// a una TV spenta, e riavviare la CU non la ripara mai. La correlazione non lo attraversa mai.

export type Relation = "DependsOn" | "Observes";
