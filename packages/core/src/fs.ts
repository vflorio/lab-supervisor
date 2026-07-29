import { pipe } from "fp-ts/lib/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type { AppError } from "./errors";
import type { Logger } from "./logger/logger";

export interface FileSystemError extends AppError<"FileSystemError"> {}

export type ReadFile = (path: string) => TE.TaskEither<FileSystemError, string>;
export type WriteFile = (path: string, content: string) => TE.TaskEither<FileSystemError, void>;

export type Env = {
  readonly logger: Logger;
  readonly readFile: ReadFile;
  readonly writeFile: WriteFile;
};

export const read =
  (path: string): RTE.ReaderTaskEither<Env, FileSystemError, string> =>
  ({ logger, readFile }) =>
    pipe(
      TE.fromIO(logger.debug(`Reading ${path}`)),
      TE.flatMap(() => readFile(path)),
    );

export const write =
  (path: string, content: string): RTE.ReaderTaskEither<Env, FileSystemError, void> =>
  ({ logger, writeFile }) =>
    pipe(
      TE.fromIO(logger.debug(`Writing ${path}`)),
      TE.flatMap(() => writeFile(path, content)),
    );
