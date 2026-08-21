// Gli argomenti della riga di comando: uno solo, il file di configurazione. Stessa forma del branch
// `main` (`--config <path>`), perché chi avvia il servizio in laboratorio non deve reimparare nulla.

import * as E from "fp-ts/Either";

export type Args = { readonly configPath: string };

export const usage = "uso: supervisor --config <percorso del file .jsonc>";

export const parse = (argv: ReadonlyArray<string>): E.Either<string, Args> => {
  const args = argv.slice(2);
  const at = args.indexOf("--config");
  const path = at >= 0 ? args[at + 1] : undefined;
  return path === undefined || path.startsWith("--") ? E.left(usage) : E.right({ configPath: path });
};
