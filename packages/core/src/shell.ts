import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type { AppError } from "./errors";
import type * as Logger from "./logger/logger";

export interface CommandError extends AppError<"CommandError"> {}

export interface CommandTimeoutError extends AppError<"CommandTimeout"> {}

export type ShellSpawnError = CommandError | CommandTimeoutError;

export type Spawn = (
  command: string,
  args: readonly string[],
  timeoutMs?: number,
) => TE.TaskEither<ShellSpawnError, string>;

export type Env = {
  readonly logger: Logger.Tagged;
  readonly spawn: Spawn;
};

const formatCommand = (command: string, args: readonly string[]): string => `${command} ${args.join(" ")}`;

export const run =
  (command: string, args: readonly string[], timeoutMs?: number): RTE.ReaderTaskEither<Env, ShellSpawnError, string> =>
  ({ logger, spawn }) =>
    pipe(
      TE.Do,
      TE.tapIO(() => logger.debug(`Shell: "${formatCommand(command, args)}"`)),
      TE.bind("spawnLogger", () => TE.fromIO(IO.of(logger.child(`Spawn`)))),
      TE.tapIO(({ spawnLogger }) => spawnLogger.debug(`Process start: "${formatCommand(command, args)}"`)),
      TE.bind("stdout", () =>
        pipe(
          spawn(command, args, timeoutMs),
          TE.map((stdout) => stdout.trim()),
        ),
      ),
      TE.tapIO(({ spawnLogger, stdout }) => spawnLogger.debug(`Process output:\n${stdout}`)),
      TE.tapIO(({ spawnLogger }) => spawnLogger.debug(`Process end: "${formatCommand(command, args)}"`)),
      TE.map(({ stdout }) => stdout),
    );
