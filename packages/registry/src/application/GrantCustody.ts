// Consegna il device a un terzo (oggi: una sessione di registrazione). Fallisce con
// `CustodyDenied` se qualcun altro ce l'ha già in mano — un maintenance hold non si scavalca
// nemmeno per registrare.

import type { Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { Custody } from "../domain/Custody";
import * as Device from "../domain/Device";
import type { DeviceEvent } from "../domain/DeviceEvent";
import type { DeviceId } from "../domain/DeviceId";
import * as Errors from "../domain/errors";
import * as Repository from "../ports/DeviceRepository";

export type Input = { readonly deviceId: DeviceId; readonly custody: Custody };

export type Output = Decision<Device.Device, DeviceEvent>;

export const execute = (
  input: Input,
  now: Instant,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, Errors.RegistryError, Output> =>
  pipe(
    Repository.findById(input.deviceId),
    RTE.flatMapEither(E.fromOption(() => Errors.deviceNotFound(input.deviceId))),
    RTE.flatMapEither((device) => Device.grantCustody(device, input.custody, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
