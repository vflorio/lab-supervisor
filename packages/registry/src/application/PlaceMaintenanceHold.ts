// Un operatore prende in mano il device per manutenzione. Da qui in poi il supervisore non lo
// comanda più, e non c'è modo di scavalcarlo (FATTO-15): l'hold non scade da solo, lo toglie
// una persona.
// Non aborta le sessioni di recupero in corso: quella è una reazione, e le reazioni stanno
// nell'application layer di chi le subisce (`onMaintenanceHoldPlaced`, M-9). Il registry
// pubblica il fatto e basta.

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

export type Input = { readonly deviceId: DeviceId; readonly reason: string };

export type Output = Decision<Device.Device, DeviceEvent>;

export const execute = (
  input: Input,
  now: Instant,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, Errors.RegistryError, Output> =>
  pipe(
    Repository.findById(input.deviceId),
    RTE.flatMapEither(E.fromOption(() => Errors.deviceNotFound(input.deviceId))),
    RTE.map((device) => Device.placeMaintenanceHold(device, input.reason, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
