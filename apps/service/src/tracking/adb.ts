import * as Errors from "@supervisor/core/errors";
import * as IntervalLoop from "@supervisor/core/interval-loop";
import type * as Logger from "@supervisor/core/logger";
import * as Network from "@supervisor/core/network";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import * as Adb from "@supervisor/core/services/adb";
import * as E from "fp-ts/Either";
import type { AdbDeviceStream } from "./adb-stream";

// -------------------------------------------------------------------------------------
// ADB reachability tracker - dominio "adb":
// raggiungibilità dei device Android via rete locale
// -------------------------------------------------------------------------------------

export const DOMAIN = "adb";

const keyOf = (device: Adb.Device): string => Network.format(device.target);

const toFacts = (device: Adb.Device): Readonly<Record<string, Predicates.PredicateValue>> => ({
  adb_device_reachable: device.status === "device",
});

export const run = (
  logger: Logger.Tagged,
  stream: Predicates.PredicateStream,
  policy: Retry.Policy,
  env: Adb.AdbEnv,
  adbDeviceStream: AdbDeviceStream,
): IntervalLoop.Handle => {
  const diffFor = Predicates.diff<Adb.Device>(DOMAIN, keyOf, toFacts);
  let snapshot: ReadonlyMap<string, Predicates.PredicateValue> = new Map();

  const domainLogger = logger.child(DOMAIN);

  const tick = async (): Promise<void> => {
    domainLogger.debug(`Tracking tick`);

    const result = await Adb.devices(env)();

    if (E.isLeft(result)) {
      domainLogger.error(`[${DOMAIN}] tracker poll failed: ${Errors.format(result.left)}`)();
      return;
    }

    adbDeviceStream.publish(result.right);

    const { changed, next } = diffFor(snapshot, result.right);
    snapshot = next;

    for (const fact of changed) stream.emit(fact);
  };

  return IntervalLoop.create(domainLogger, policy, tick, `(Tracker) ${DOMAIN}`);
};
