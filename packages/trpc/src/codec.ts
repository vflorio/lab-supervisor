import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import type * as T from "io-ts";
import type { Errors } from "io-ts";
import { PathReporter } from "io-ts/PathReporter";

// Il throw viene catturato da `publicProcedure` e trasformato in un errore tRPC
export const decodeOrThrow =
  <A>(codec: { decode: (u: unknown) => E.Either<Errors, A> }) =>
  (value: unknown): A =>
    pipe(
      codec.decode(value),
      E.getOrElse<Errors, A>((errors) => {
        throw new Error(PathReporter.report(E.left(errors)).join("; "));
      }),
    );

// `decodeOrThrow` da solo tipizza il client sulla stessa forma del valore *decodificato*
// (tRPC, per un validatore "bare function", assume input === output). Va bene quando i campi
// del codec non trasformano la rappresentazione, ma per un codec il cui wire format differisce
// da quello decodificato (es. `AdbEntryCodec.target`: stringa sul wire, `{ip,port}` decodificato,
// o `WorkflowJsonCodec`: tupla `[name, steps]` sul wire, `{name, commands}` decodificato)
// forzerebbe il client a inviare già la forma decodificata, che il decode server-side rigetta.
// Questo wrapper dichiara esplicitamente input (wire, `OutputOf`) e output (decodificato, `TypeOf`) distinti.
export const wireInput = <A, O>(codec: T.Type<A, O, unknown>) => ({
  _input: undefined as unknown as O,
  _output: undefined as unknown as A,
  parse: decodeOrThrow(codec),
});
