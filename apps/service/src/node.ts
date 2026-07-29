import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import * as Errors from "@supervisor/core/errors";
import type * as Fs from "@supervisor/core/fs";
import * as Logger from "@supervisor/core/logger/logger";
import type * as Shell from "@supervisor/core/shell";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as ServiceLogger from "./logger";

export interface Process {
  readonly onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  readonly exit: (code: number) => never;
}

const isTimedOut = (error: unknown): boolean =>
  error instanceof Error && "killed" in error && Boolean((error as Error & { killed?: boolean }).killed);

export const spawn: Shell.Spawn = (command, args, timeoutMs) =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<string>((resolve, reject) => {
          execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
            if (!error) return resolve(stdout);
            reject(Object.assign(new Error(`${error.message} - ${stderr}`), { killed: error.killed }));
          });
        }),
      (error) =>
        isTimedOut(error) //
          ? Errors.fromUnknown("CommandTimeout")(error)
          : Errors.fromUnknown("CommandError")(error),
    ),
  );

export const fsEnv: Fs.Env = {
  logger: pipe(ServiceLogger.create({ level: "debug" }), Logger.tagged("FileSystem")),

  readFile: (path) =>
    pipe(
      TE.tryCatch(() => readFile(path, "utf-8"), Errors.fromUnknown("FileSystemError")),
      TE.tapIO(() => fsEnv.logger.debug(`Read file: ${path}`)),
    ),

  writeFile: (path, content) =>
    pipe(
      TE.tryCatch(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
      }, Errors.fromUnknown("FileSystemError")),
      TE.tapIO(() => fsEnv.logger.debug(`Write file: ${path}`)),
    ),
};
