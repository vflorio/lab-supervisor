// Quando "abbastanza figli giù" diventa "è colpa della CU".
// `AllChildren` è la predefinita ed è ciò che serve al lab: tutti i device di quella CU giù ⇒
// è la CU. Le altre due esistono perché un lab più grande vorrà una soglia più morbida.
// Numeratore e denominatore contano **gli stessi** figli — monitorati, supervisionati, senza
// custodia esterna (INV-11): un figlio sotto maintenance hold non fa scattare né impedisce una
// correlazione, esce dal conto e basta.

export type CorrelationRule =
  | { readonly _tag: "AllChildren" }
  | { readonly _tag: "MinChildren"; readonly min: number }
  | { readonly _tag: "Fraction"; readonly fraction: number };

export const allChildren: CorrelationRule = { _tag: "AllChildren" };

export const minChildren = (min: number): CorrelationRule => ({ _tag: "MinChildren", min: Math.max(1, min) });

export const fraction = (value: number): CorrelationRule => ({
  _tag: "Fraction",
  fraction: Math.min(1, Math.max(0, value)),
});

// Zero figli giù non incolpa mai nessuno, e nemmeno un insieme vuoto di figli: una CU senza
// dipendenti correlabili non ha un cluster da spiegare.
export const blames = (rule: CorrelationRule, down: number, total: number): boolean => {
  if (down <= 0 || total <= 0) return false;
  switch (rule._tag) {
    case "AllChildren":
      return down >= total;
    case "MinChildren":
      return down >= rule.min;
    case "Fraction":
      return down / total >= rule.fraction;
  }
};

// Il numero minimo di figli giù che soddisfa la regola. Serve a datare l'outage di un cluster
// al momento in cui il **quorum** è stato raggiunto, non al primo figlio caduto (FL-3).
export const quorumSize = (rule: CorrelationRule, total: number): number => {
  for (let down = 1; down <= total; down++) if (blames(rule, down, total)) return down;
  return total;
};
