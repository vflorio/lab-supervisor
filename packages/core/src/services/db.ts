import * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { type AppError, fromUnknown } from "../errors";
import type * as Fs from "../fs";
import * as Lab from "./lab-registry";
import type { SuitestLists } from "./suitest-store";
import * as SuitestStoreDomain from "./suitest-store";

export * from "./lab-registry";
export * from "./suitest-store";

// -------------------------------------------------------------------------------------
// Model - db multi-dominio:.
// `suitest` è il mirror in sola lettura dei dati grezzi Suitest (formato originale, indicizzato per id).
// `lab` è il dominio applicativo del supervisor (label/controlled/ip), preconfigurabile
// e operabile offline, che referenzia `suitest` tramite un campo `suitestId` opzionale per ogni
// entry (tranne i control unit, la cui identità coincide con quella Suitest).
// -------------------------------------------------------------------------------------

export const DbCodec = t.type({
  suitest: SuitestStoreDomain.SuitestStoreCodec,
  lab: Lab.LabRegistryCodec,
});

export type Database = t.TypeOf<typeof DbCodec>;

export const empty: Database = { suitest: SuitestStoreDomain.empty, lab: Lab.empty };

export type DbError = Fs.FileSystemError | Validation.ValidationError | ParseError;

export interface ParseError extends AppError<"ParseError"> {}

// -------------------------------------------------------------------------------------
// Persistence: read(mutate(write))
// -------------------------------------------------------------------------------------

const parseJson = (raw: string): E.Either<ParseError, unknown> =>
  E.tryCatch(() => JSON.parse(raw), fromUnknown("ParseError"));

export const read =
  (path: string): ((env: Fs.Env) => TE.TaskEither<DbError, Database>) =>
  (env) =>
    pipe(env.readFile(path), TE.flatMapEither(parseJson), TE.flatMapEither(Validation.validate(DbCodec)));

export const write =
  (path: string) =>
  (db: Database): ((env: Fs.Env) => TE.TaskEither<DbError, void>) =>
  (env) =>
    env.writeFile(path, JSON.stringify(DbCodec.encode(db), null, 2));

export const modify =
  (path: string) =>
  (f: Endomorphism<Database>): ((env: Fs.Env) => TE.TaskEither<DbError, Database>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.map(f),
      TE.tap((updated) => write(path)(updated)(env)),
    );

// Applica una modifica pura al solo dominio applicativo (`lab`), lasciando `suitest` invariato
export const modifyLab =
  (path: string) =>
  (f: Endomorphism<Lab.LabRegistry>): ((env: Fs.Env) => TE.TaskEither<DbError, Database>) =>
    modify(path)((db) => ({ ...db, lab: f(db.lab) }));

// -------------------------------------------------------------------------------------
// Init: se non esiste crea il file e seeding, altrimenti legge
// -------------------------------------------------------------------------------------

const seedDict = <T extends { controlled: boolean }>(items: readonly T[], id: (item: T) => string): Record<string, T> =>
  Object.fromEntries(items.map((item) => [id(item), { ...item, controlled: true }]));

export const init =
  (path: string, seed?: Lab.LabRegistrySeed): ((env: Fs.Env) => TE.TaskEither<DbError, Database>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.orElse(() => {
        const initial: Database = {
          suitest: SuitestStoreDomain.empty,
          lab: {
            candyboxes: seedDict(seed?.candyboxes ?? [], (d) => d.id),
            cameras: seedDict(seed?.cameras ?? [], (d) => d.id),
            tvs: seedDict(seed?.tvs ?? [], (d) => d.deviceId),
            adb: Object.fromEntries((seed?.adb ?? []).map((d) => [d.id, d])),
          },
        };

        return pipe(
          write(path)(initial)(env),
          TE.map(() => initial),
        );
      }),
    );

// -------------------------------------------------------------------------------------
// Sync da Suitest: sostituisce integralmente il mirror `suitest` e auto-importa le
// control unit nel dominio `lab` (identità condivisa, nessuna riconciliazione manuale necessaria).
// TV e Camera non vengono toccate: la loro associazione a un'entità Suitest (`suitestId`)
// è manuale, fatta via UI.
// -------------------------------------------------------------------------------------

export const syncFromSuitest =
  (path: string) =>
  (incoming: SuitestLists): ((env: Fs.Env) => TE.TaskEither<DbError, Database>) =>
    modify(path)((db) => ({
      suitest: SuitestStoreDomain.replaceFromSuitest(incoming),
      lab: Lab.upsertCandyboxesFromSuitestControlUnits(incoming.controlUnits)(db.lab),
    }));
