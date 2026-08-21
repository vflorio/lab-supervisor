// La traduzione di un `Incident` in un messaggio leggibile. Vive qui e non nel dominio perché è
// una questione di presentazione: il dominio produce il dossier, non le parole per raccontarlo
// (M-7). In questo giro solo la firma (NO-14).
// Deve contenere abbastanza diagnosi da evitare che qualcuno debba aprire i log (FATTO-16): cosa è
// caduto e da quando, quali rimedi sono stati provati e con che esito, quali sono stati scartati e
// perché, e la fotografia di tutte le facce di tutti i device coinvolti — perché una camera con lo
// stream giù e l'adb vivo racconta una storia diversa da una camera muta su entrambi.

import type { Incident } from "@lab/recovery/domain/Incident";

export type MessageBlock = { readonly kind: "header" | "section" | "context"; readonly text: string };

export declare const render: (incident: Incident) => ReadonlyArray<MessageBlock>;
