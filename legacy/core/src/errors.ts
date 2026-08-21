// Base ADT per gli errori applicativi. Ogni errore di dominio dichiara la propria interfaccia
// (`extends AppError<"Tag">`) nel modulo che lo genera; solo i "verbi" davvero trasversali
// (I/O, rete, validazione) vanno centralizzati qui per evitare N tipi strutturalmente
// identici con nomi diversi. Il discriminante è `type`, stessa convenzione degli altri ADT
// del progetto - così ts-pattern fa exhaustive matching allo stesso modo, errori inclusi.

export interface AppError<Tag extends string = string> {
  readonly type: Tag;
  readonly message: string;
}

// Costruttore per errori sollevati manualmente (non da un'eccezione)
export const of =
  <Tag extends string>(type: Tag) =>
  (message: string): AppError<Tag> => ({ type, message });

// Costruttore per il mapper `onRejected` di TE.tryCatch/E.tryCatch: normalizza `unknown` in un messaggio
export const fromUnknown =
  <Tag extends string>(type: Tag) =>
  (e: unknown): AppError<Tag> => ({
    type,
    message: e instanceof Error ? e.message : String(e),
  });

// Formattazione per console/log, comune a tutti gli AppError - da interpolare in un
// messaggio contestuale, es. `Suitest init failed: ${format(err)}`
export const format = (e: AppError): string => `Error(${e.type}, ${e.message})`;
