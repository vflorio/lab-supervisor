// Adapter finto dell'anagrafica: una mappa e nient'altro. Serve a montare l'esagono nei test
// senza database — la `Topology` viene ricalcolata a ogni richiesta, che è esattamente ciò che
// è (una proiezione, non uno stato).

import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import type { Device } from "../domain/Device";
import type { DeviceId } from "../domain/DeviceId";
import type { DeviceKind } from "../domain/DeviceKind";
import * as Topology from "../domain/Topology";
import type { DeviceRepository } from "../ports/DeviceRepository";

export interface InMemoryDeviceRepository extends DeviceRepository {
  readonly all: () => ReadonlyArray<Device>;
}

export const make = (seed: ReadonlyArray<Device> = []): InMemoryDeviceRepository => {
  const devices = new Map<DeviceId, Device>(seed.map((device) => [device.id, device]));
  const all = () => [...devices.values()];

  return {
    all,
    findById: (id) => TE.right(O.fromNullable(devices.get(id))),
    findByKind: (kind: DeviceKind) => TE.right(all().filter((device) => device.kind === kind)),
    topology: () => TE.right(Topology.fromDevices(all())),
    save: (device) =>
      TE.fromIO(() => {
        devices.set(device.id, device);
      }),
  };
};
