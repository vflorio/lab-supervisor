import { readFileSync } from "node:fs";
import * as Config from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as HTTP from "@supervisor/core/http";
import type * as Validation from "@supervisor/core/validation";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { parse as parseJsonc } from "jsonc-parser";
import type * as Args from "./args";

export interface FetchError extends Errors.AppError<"FetchError"> {}

export type ConfigFetcher = () => TE.TaskEither<FetchError, unknown>;

const fromFile =
  (path: string): ConfigFetcher =>
  () =>
    TE.tryCatch(
      () => Promise.resolve(parseJsonc(readFileSync(path, "utf-8"))),
      (fsError) => Errors.of("FetchError")(`Cannot read config file: ${fsError}`),
    );

const fromUrl =
  (url: string): ConfigFetcher =>
  () =>
    pipe(
      HTTP.getJson(url),
      TE.mapLeft((httpError) => Errors.of("FetchError")(`Cannot fetch config from URL: ${Errors.format(httpError)}`)),
    );

export const toFetcher = (source: Args.ConfigSource): ConfigFetcher =>
  source.type === "file" ? fromFile(source.path) : fromUrl(source.url);

// Un decode fallito è una ValidationError come qualsiasi altro decode io-ts - niente
// LoadError dedicato per la stessa identica causa.

export const load = (fetcher: ConfigFetcher): TE.TaskEither<Validation.ValidationError | FetchError, Config.Service> =>
  pipe(fetcher(), TE.flatMapEither(Config.decode));
