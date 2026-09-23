import { readFileSync } from "node:fs";
import * as Config from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import * as HTTP from "@supervisor/core/http";
import type * as Validation from "@supervisor/core/validation";
import * as E from "fp-ts/Either";
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

export interface EnvError extends Errors.AppError<"EnvError"> {}

const requireEnv = (name: string): E.Either<EnvError, string> => {
  const value = process.env[name];
  return value ? E.right(value) : E.left(Errors.of("EnvError")(`Missing required environment variable: ${name}`));
};

export const credentialsFromEnv = (): E.Either<EnvError, Config.Credentials> =>
  pipe(
    E.Do,
    E.bind("suitestTokenId", () => requireEnv("SUITEST_TOKEN_ID")),
    E.bind("suitestTokenPassword", () => requireEnv("SUITEST_TOKEN_PASSWORD")),
    E.bind("slackBotToken", () => requireEnv("SLACK_BOT_TOKEN")),
    E.bind("raspberrySshUser", () => requireEnv("RASPBERRY_SSH_USER")),
  );

export const load = (
  fetcher: ConfigFetcher,
  credentials: Config.Credentials,
): TE.TaskEither<Validation.ValidationError | FetchError, Config.Service> =>
  pipe(
    fetcher(),
    TE.flatMapEither(Config.decode),
    TE.map((file) => Config.withCredentials(file, credentials)),
  );
