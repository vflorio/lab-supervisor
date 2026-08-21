// Perché una sessione si è **arresa**. A differenza di un abort, una resa significa che il
// device è rotto per quanto ne sappiamo: alza un incidente e fissa un cooldown (INV-9).
// `RemedyUnsupported` è la resa immediata di FL-2: ritentare una cosa che quel device non
// saprà mai fare è solo rumore.

export type GiveUpReason = { readonly _tag: "PlaybookExhausted" } | { readonly _tag: "RemedyUnsupported" };

export const playbookExhausted: GiveUpReason = { _tag: "PlaybookExhausted" };

export const remedyUnsupported: GiveUpReason = { _tag: "RemedyUnsupported" };
