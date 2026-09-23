import type * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type * as Network from "../network";
import * as Shell from "../shell";

export interface SshEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

export interface SshError extends Errors.AppError<"SshError"> {}

export type Error = Shell.ShellSpawnError | SshError;

type Effect<A> = RTE.ReaderTaskEither<SshEnv, Error, A>;

// Destinazione SSH = username generico (`RASPBERRY_SSH_USER`, valido per tutte le CU) + host di
// rete risolto dal registry.
export interface Target {
  readonly user: string;
  readonly host: Network.Host;
}

export const target = (user: string, host: Network.Host): Target => ({ user, host });

// Timeout di default per i comandi one-shot (coerente con l'adapter adb)
const DEFAULT_COMMAND_TIMEOUT_MS = 15_000;

const sshArgs = (target: Target, command: readonly string[]): readonly string[] => [
  "-o",
  "BatchMode=yes",
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "ConnectTimeout=10",
  `${target.user}@${target.host.ip}`,
  ...command,
];

export const run =
  (
    target: Target,
    command: readonly string[],
    timeoutMs: number | undefined = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Effect<string> =>
  ({ logger, spawn }) =>
    Shell.run("ssh", sshArgs(target, command), timeoutMs)({ spawn, logger });

// `sudo reboot`: il reboot richiede privilegi di root - il `RASPBERRY_SSH_USER` deve poter fare
// `sudo` senza password (default su Raspberry Pi OS). La connessione cade quando la macchina si
// riavvia, ma `reboot` schedula e ritorna prima che il link si chiuda.
export const reboot = (target: Target): Effect<void> => pipe(run(target, ["sudo", "reboot"]), RTE.asUnit);
