// L'operatore restituisce il device al supervisore. Togliere un hold che non c'è non è un
// errore: è un non-fatto, e non produce eventi.

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
    RTE.map((device) => Device.liftMaintenanceHold(device, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
