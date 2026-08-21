// Mette a anagrafica un device nuovo. Non lo attacca a nulla: l'attacco è un'altra decisione
// (`AttachDevice`) perché è l'unica che ha bisogno di vedere il resto della topologia.

import type { Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as Device from "../domain/Device";
import type { DeviceEvent } from "../domain/DeviceEvent";
import type { RegistryError } from "../domain/errors";
import * as Repository from "../ports/DeviceRepository";

export type Input = Device.Draft;

export type Output = Decision<Device.Device, DeviceEvent>;

export const execute = (
  input: Input,
  now: Instant,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, RegistryError, Output> =>
  pipe(
    RTE.fromEither(Device.register(input, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
