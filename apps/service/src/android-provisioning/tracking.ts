import type * as Errors from "@supervisor/core/errors";
import type * as Logger from "@supervisor/core/logger/logger";
import * as Network from "@supervisor/core/network";
import * as Provisioning from "@supervisor/core/provisioning/model";
import type * as Retry from "@supervisor/core/retry/retry";
import * as TaskRunner from "@supervisor/core/task-runner/index";
import * as E from "fp-ts/Either";
import type * as TE from "fp-ts/TaskEither";
import type { AdbDeviceStream } from "../android-bridge/stream";
import type * as ProvisioningRunner from "./runner";

// Tracker dello stato di provisioning; legge solo, non scrive sul device

export interface Deps {
  readonly logger: Logger.Tagged;
  readonly runner: ProvisioningRunner.Handle;
  readonly adbDeviceStream: AdbDeviceStream;
  readonly policy: Retry.Policy;
  readonly descriptor: TaskRunner.LoopDescriptor;
  readonly loopStream?: TaskRunner.LoopStream;
}

export const create = ({
  logger,
  runner,
  adbDeviceStream,
  policy,
  descriptor,
  loopStream,
}: Deps): TaskRunner.Handle => {
  const domainLogger = logger.child(Provisioning.DOMAIN);

  const onTick: TE.TaskEither<Errors.AppError, string | undefined> = async () => {
    // Senza provisioning in config ogni lettura fallirebbe; non girare affatto
    if (!runner.isConfigured) return E.right("provisioning not configured");

    const reachable = adbDeviceStream.snapshot().filter((device) => device.status === "device");

    let failures = 0;

    // Sequenziale di proposito: adb shell in parallelo competono con recovery
    for (const device of reachable) {
      const result = await runner.refresh(device.target)();

      // Lettura fallita = ignoto, non "non provisionato"; preserva fatti precedenti
      if (E.isLeft(result)) {
        failures += 1;
        domainLogger.warn(`agent status read failed for ${Network.format(device.target)}`)();
      }
    }

    return E.right(`${reachable.length} devices, ${failures} unreadable`);
  };

  const loop = TaskRunner.create({ logger: domainLogger, descriptor, policy, onTick, loopStream });

  // Lettura subito al collegamento: il timer da solo nasconderebbe stato fino al tick successivo
  const known = new Set<string>();

  const unsubscribe = adbDeviceStream.subscribe((devices) => {
    if (!runner.isConfigured) return;

    const reachable = devices.filter((device) => device.status === "device");
    const current = new Set(reachable.map((device) => Network.format(device.target)));

    // Dimenticare device spariti cosi al ritorno (reboot, reset) si rilevano subito
    for (const target of known) if (!current.has(target)) known.delete(target);

    for (const device of reachable) {
      const target = Network.format(device.target);
      if (known.has(target)) continue;
      known.add(target);

      void runner.refresh(device.target)();
    }
  });

  return {
    start: loop.start,
    stop: () => {
      unsubscribe();
      loop.stop();
    },
  };
};
