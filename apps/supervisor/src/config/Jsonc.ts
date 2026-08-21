// JSON con i commenti dentro. Il file di configurazione del lab li aveva già sul branch `main`, e
// toglierli sarebbe una perdita secca: le coordinate di un tap o un timeout di novanta secondi si
// capiscono solo se accanto c'è scritto perché.
// Non è un parser: è uno scanner che cancella commenti e virgole pendenti e passa il resto a
// `JSON.parse`. Deve però attraversare le stringhe per davvero — un `//` dentro un URL non è un
// commento, e una virgola dentro un messaggio non è pendente — ed è l'unica ragione per cui non è
// una regex.

import * as E from "fp-ts/Either";

export type ParseFailure = { readonly _tag: "ParseFailure"; readonly detail: string };

const parseFailure = (detail: string): ParseFailure => ({ _tag: "ParseFailure", detail });

// Toglie l'ultima virgola già emessa: serve quando si incontra la chiusura di un oggetto o di un
// array, cioè il solo punto in cui una virgola diventa pendente.
const withoutDanglingComma = (emitted: string): string => {
  const trimmed = emitted.trimEnd();
  return trimmed.endsWith(",") ? `${trimmed.slice(0, -1)} ` : emitted;
};

const stripped = (raw: string): string => {
  let out = "";
  let index = 0;

  while (index < raw.length) {
    const current = raw[index] as string;
    const next = raw[index + 1];

    if (current === '"') {
      out += current;
      index += 1;
      while (index < raw.length) {
        const char = raw[index] as string;
        if (char === "\\") {
          out += char + (raw[index + 1] ?? "");
          index += 2;
          continue;
        }
        out += char;
        index += 1;
        if (char === '"') break;
      }
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < raw.length && raw[index] !== "\n") index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      index += 2;
      while (index < raw.length && !(raw[index] === "*" && raw[index + 1] === "/")) index += 1;
      index += 2;
      continue;
    }

    if (current === "}" || current === "]") out = withoutDanglingComma(out);

    out += current;
    index += 1;
  }

  return out;
};

export const parse = (raw: string): E.Either<ParseFailure, unknown> =>
  E.tryCatch(
    () => JSON.parse(stripped(raw)) as unknown,
    (error) => parseFailure(error instanceof Error ? error.message : String(error)),
  );
