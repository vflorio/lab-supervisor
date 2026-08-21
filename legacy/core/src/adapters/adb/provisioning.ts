import * as Errors from "@supervisor/core/errors";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import type * as Network from "../../network";
import * as Adb from "./shell";

// Verbi ADB del provisioning (install/grant/doze/launch) + lettura di stato. Non idempotente.

type Effect<A> = RTE.ReaderTaskEither<Adb.AdbEnv, Adb.Error, A>;

// L'APK dell'agent pesa ~20 MB e il push passa dalla WiFi del lab: il default di 15s non basta.
const INSTALL_TIMEOUT_MS = 180_000;

// `adb install` esce 0 anche se fallisce; verificare stdout per `Failure [motivo]`
const FAILURE_REGEX = /^Failure\s*\[([^\]]*)\]/m;

// Firma diversa: uninstall obbligato (grant cade; runner's retry pass lo rimette)
const SIGNATURE_MISMATCH = ["INSTALL_FAILED_UPDATE_INCOMPATIBLE", "INSTALL_FAILED_VERSION_DOWNGRADE"];

// packageId va interpolato in shell script sul device; regex previene command injection
const PACKAGE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

const invalidPackageId = (packageId: string): Adb.Error =>
  Errors.of("AdbError")(`Invalid package id: ${JSON.stringify(packageId)}`);

const validPackageId = (packageId: string): Effect<string> =>
  PACKAGE_ID_REGEX.test(packageId) ? RTE.right(packageId) : RTE.left(invalidPackageId(packageId));

// -------------------------------------------------------------------------------------
// Lettura di stato
// -------------------------------------------------------------------------------------

// Sei condizioni indipendenti; record non booleano (puo avere app senza grant o senza servizio)
export interface AgentStatus {
  readonly installed: boolean;
  readonly permissionGranted: boolean;
  readonly wifiDebuggingEnabled: boolean;
  readonly usbDebuggingEnabled: boolean;
  readonly dozeExempt: boolean;
  readonly serviceRunning: boolean;
  readonly versionCode: O.Option<number>;
}

// Un solo `adb shell` per tutte le letture. Grep sul device riduce output a 7 righe vs 200KB
const statusScript = (packageId: string): string =>
  [
    `p=${packageId}`,
    'echo installed=$(pm list packages | grep -c "^package:$p$")',
    'echo permission=$(dumpsys package $p | grep -c "WRITE_SECURE_SETTINGS: granted=true")',
    "echo wifi=$(settings get global adb_wifi_enabled)",
    "echo usb=$(settings get global adb_enabled)",
    'echo doze=$(dumpsys deviceidle whitelist | grep -c "$p")',
    'echo service=$(dumpsys activity services $p | grep -c "isForeground=true")',
    'echo version=$(dumpsys package $p | grep -o "versionCode=[0-9]*" | head -n 1 | cut -d= -f2)',
    // `grep -c` esce 1 quando conteggio e 0; `true` assicura che script vada bene
    "true",
  ].join("; ");

const parseFields = (stdout: string): ReadonlyMap<string, string> =>
  new Map(
    stdout
      .split("\n")
      .map((line) => line.trim().split("="))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([key, value]) => [key, value.trim()]),
  );

// `settings get global` ritorna "null" per chiavi non scritte (non errore)
const isEnabled = (raw: string | undefined): boolean => raw === "1";

const isPresent = (raw: string | undefined): boolean => Number(raw ?? "0") > 0;

export const parseStatus = (stdout: string): AgentStatus => {
  const fields = parseFields(stdout);
  const versionCode = Number(fields.get("version"));

  return {
    installed: isPresent(fields.get("installed")),
    permissionGranted: isPresent(fields.get("permission")),
    wifiDebuggingEnabled: isEnabled(fields.get("wifi")),
    usbDebuggingEnabled: isEnabled(fields.get("usb")),
    dozeExempt: isPresent(fields.get("doze")),
    serviceRunning: isPresent(fields.get("service")),
    versionCode: Number.isInteger(versionCode) && versionCode > 0 ? O.some(versionCode) : O.none,
  };
};

export const readAgentStatus =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<AgentStatus> =>
    pipe(
      validPackageId(packageId),
      RTE.flatMap((pkg) => Adb.run(["shell", statusScript(pkg)], target)),
      RTE.map(parseStatus),
    );

// -------------------------------------------------------------------------------------
// Scritture
// -------------------------------------------------------------------------------------

const failureReason = (stdout: string): O.Option<string> =>
  pipe(
    O.fromNullable(FAILURE_REGEX.exec(stdout)),
    O.map((match) => match[1] ?? "unknown"),
  );

const uninstall =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(Adb.run(["uninstall", packageId], target), RTE.asUnit);

const install =
  (apkPath: string) =>
  (target: Network.Endpoint): Effect<O.Option<string>> =>
    pipe(Adb.run(["install", "-r", apkPath], target, INSTALL_TIMEOUT_MS), RTE.map(failureReason));

// `install -r` preserva WRITE_SECURE_SETTINGS; solo firma incompatibile forza uninstall
export const installOrReplace =
  (apkPath: string, packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(
      validPackageId(packageId),
      RTE.flatMap(() => install(apkPath)(target)),
      RTE.flatMap(
        O.match(
          () => RTE.right<Adb.AdbEnv, Adb.Error, void>(undefined),
          (reason) =>
            SIGNATURE_MISMATCH.some((code) => reason.includes(code))
              ? pipe(
                  uninstall(packageId)(target),
                  RTE.flatMap(() => install(apkPath)(target)),
                  RTE.flatMap(
                    O.match(
                      () => RTE.right<Adb.AdbEnv, Adb.Error, void>(undefined),
                      (retryReason) => RTE.left(Errors.of("AdbError")(`install failed: ${retryReason}`)),
                    ),
                  ),
                )
              : RTE.left(Errors.of("AdbError")(`install failed: ${reason}`)),
        ),
      ),
    );

// Protection level `development`: si concede una volta dall'host, persiste tramite install -r
export const grantWriteSecureSettings =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(
      validPackageId(packageId),
      RTE.flatMap((pkg) => Adb.run(["shell", "pm", "grant", pkg, "android.permission.WRITE_SECURE_SETTINGS"], target)),
      RTE.asUnit,
    );

export const exemptFromDoze =
  (packageId: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(
      validPackageId(packageId),
      RTE.flatMap((pkg) => Adb.run(["shell", "dumpsys", "deviceidle", "whitelist", `+${pkg}`], target)),
      RTE.asUnit,
    );

// Toglie stopped state cosi BOOT_COMPLETED arriva dopo reboot
export const launchAgent =
  (packageId: string, activity: string) =>
  (target: Network.Endpoint): Effect<void> =>
    pipe(
      validPackageId(packageId),
      RTE.flatMap((pkg) => Adb.run(["shell", "am", "start", "-n", `${pkg}/${activity}`], target)),
      RTE.asUnit,
    );
