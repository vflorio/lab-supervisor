// L'esito del **dispaccio**, mai della guarigione. `Accepted` significa "il comando è stato
// preso in carico", non "il device è guarito": quello lo stabilisce solo la verifica (INV-5).
// Nessuno `statusCode`, nessuno `stderr`, nessun errore di libreria — se attraversassero la
// porta l'ACL avrebbe perso (A-6, NO-10). Il canale d'errore della porta è `never` proprio
// perché un rimedio rifiutato è un esito che la sessione deve poter scrivere nel dossier.

export type RemedyOutcome =
  | { readonly _tag: "Accepted" }
  | { readonly _tag: "Rejected"; readonly reason: string }
  | { readonly _tag: "Unreachable" }
  | { readonly _tag: "Unsupported" }
  | { readonly _tag: "TransportError"; readonly detail: string };

export const accepted: RemedyOutcome = { _tag: "Accepted" };

export const rejected = (reason: string): RemedyOutcome => ({ _tag: "Rejected", reason });

export const unreachable: RemedyOutcome = { _tag: "Unreachable" };

// Il device non saprà **mai** fare quella cosa (FATTO-1): ritentare è solo rumore, e la
// sessione si arrende subito (FL-2).
export const unsupported: RemedyOutcome = { _tag: "Unsupported" };

export const transportError = (detail: string): RemedyOutcome => ({ _tag: "TransportError", detail });

export const isAccepted = (outcome: RemedyOutcome): boolean => outcome._tag === "Accepted";

export const describe = (outcome: RemedyOutcome): string => {
  switch (outcome._tag) {
    case "Accepted":
      return "comando preso in carico";
    case "Rejected":
      return `comando rifiutato: ${outcome.reason}`;
    case "Unreachable":
      return "device irraggiungibile";
    case "Unsupported":
      return "il device non dichiara la capability richiesta";
    case "TransportError":
      return `errore di trasporto: ${outcome.detail}`;
  }
};
