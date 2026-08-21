// Il device torna al supervisore. Vale anche per un maintenance hold, ma la strada normale per
// toglierlo è `LiftMaintenanceHold`: qui il fatto pubblicato è "custodia rilasciata", non
// "manutenzione finita", e sono due cose che chi ascolta distingue.

import type { Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as Device from "../domain/Device";
import type { DeviceEvent } from "../domain/DeviceEvent";
import type { DeviceId } from "../domain/DeviceId";
import * as Errors from "../domain/errors";
import * as Repository from "../ports/DeviceRepository";

export type Input = { readonly deviceId: DeviceId };

export type Output = Decision<Device.Device, DeviceEvent>;

export const execute = (
  input: Input,
  now: Instant,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, Errors.RegistryError, Output> =>
  pipe(
    Repository.findById(input.deviceId),
    RTE.flatMapEither(E.fromOption(() => Errors.deviceNotFound(input.deviceId))),
    RTE.map((device) => Device.releaseCustody(device, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
