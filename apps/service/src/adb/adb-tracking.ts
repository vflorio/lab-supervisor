import * as Adb from "@supervisor/core/adapters/adb/shell";
import * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import * as TaskRunner from "@supervisor/core/task-runner";
import * as E from "fp-ts/Either";
import type { AdbDeviceStream } from "./adb-stream";

// ADB reachability tracker - dominio "adb": raggiungibilità dei device Android via rete locale
export const DOMAIN = "adb";

const keyOf = (device: Adb.Device): string => Network.format(device.target);

const toFacts = (device: Adb.Device): Readonly<Record<string, Predicates.PredicateValue>> => ({
  adb_device_reachable: device.status === "device",
});

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly adbEnv: Adb.AdbEnv;
  readonly adbDeviceStream: AdbDeviceStream;
  readonly policy: Retry.Policy;
  readonly predicateStream: Predicates.PredicateStream;
}

// Un target sparito del tutto dall'output di `adb devices` (a differenza di uno con status
// "offline") non produce item da diffare - senza questo passaggio adb_device_reachable
// resterebbe congelato al suo ultimo valore noto per sempre.
const retractVanished = (
  knownTargets: ReadonlySet<string>,
  seenTargets: ReadonlySet<string>,
): readonly Predicates.PredicateFact[] =>
  Array.from(knownTargets)
    .filter((target) => !seenTargets.has(target))
    .map((target) => ({ domain: DOMAIN, entityId: target, name: "adb_device_reachable", value: false }));

export const create = ({ logger, predicateStream, policy, adbEnv, adbDeviceStream }: Deps): TaskRunner.Handle => {
  const diffFor = Predicates.diff<Adb.Device>(DOMAIN, keyOf, toFacts);

  let snapshot: ReadonlyMap<string, Predicates.PredicateValue> = new Map();
  let knownTargets: ReadonlySet<string> = new Set();

  const domainLogger = logger.child(DOMAIN);

  const tick = async (): Promise<void> => {
    domainLogger.debug(`Tracking tick`);

    const result = await Adb.devices(adbEnv)();

    if (E.isLeft(result)) {
      domainLogger.error(`[${DOMAIN}] tracker poll failed: ${Errors.format(result.left)}`)();
      return;
    }

    adbDeviceStream.publish(result.right);

    const seenTargets = new Set(result.right.map(keyOf));
    const { changed, next } = diffFor(snapshot, result.right);
    const retracted = retractVanished(knownTargets, seenTargets).filter(
      (fact) => next.get(Predicates.factKey(fact)) !== false,
    );

    const updatedSnapshot = new Map(next);
    for (const fact of retracted) updatedSnapshot.set(Predicates.factKey(fact), false);
    snapshot = updatedSnapshot;
    knownTargets = seenTargets;

    for (const fact of [...changed, ...retracted]) predicateStream.emit(fact);
  };

  return TaskRunner.create(domainLogger, policy, tick, `(Tracker) ${DOMAIN}`);
};
