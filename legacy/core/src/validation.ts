import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as Option from "fp-ts/Option";
import * as t from "io-ts";
import { type AppError, of } from "./errors";

// Errore condiviso per ogni decodifica io-ts fallita nel progetto (config, db, risposte
// paginate, ...): un solo tag "ValidationError" per un'unica causa semantica, invece di
// un tipo diverso per ogni modulo che decodifica qualcosa.

export interface ValidationError extends AppError<"ValidationError"> {}

export const createValidationError = (errors: t.Errors): ValidationError =>
  of("ValidationError")(
    `Validation Failed: ${errors.map((e) => e.context.map(({ key }) => key).join(".")).join(", ")}`,
  );

export const validate =
  <A>(codec: t.Type<A, unknown>) =>
  (data: unknown): E.Either<ValidationError, A> =>
    pipe(data, codec.decode, E.mapLeft(createValidationError));

// Option<A> <-> nullable: per campi la cui chiave è sempre presente ma il cui valore può
// mancare (foreign key opzionali) - a differenza di `t.partial` (chiave assente = valore
// assente), qui la chiave resta obbligatoria e il valore è `null` quando assente.

const isOptionShaped = (u: unknown): u is Option.Option<unknown> =>
  typeof u === "object" && u !== null && "_tag" in u && (u._tag === "None" || u._tag === "Some");

export const optionFromNullable = <A, O>(codec: t.Type<A, O, unknown>): t.Type<Option.Option<A>, O | null, unknown> =>
  new t.Type(
    `Option<${codec.name}>`,
    (u): u is Option.Option<A> => isOptionShaped(u) && (Option.isNone(u) || codec.is(u.value)),
    (u, c) => (u === null ? t.success(Option.none) : pipe(codec.validate(u, c), E.map(Option.some))),
    (a) => (Option.isNone(a) ? null : codec.encode(a.value)),
  );
