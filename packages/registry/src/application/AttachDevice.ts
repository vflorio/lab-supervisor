// Custode di INV-12. Due metà della stessa invariante, e stanno qui insieme perché è l'unico
// punto che vede sia l'arco sia il resto dell'albero:
//  - la forma dell'arco (una TV sotto una CU, una camera che inquadra una TV) la decide
//    l'aggregato, che ha entrambi i device sotto mano;
//  - il numero di figli `DependsOn` di una CU (al massimo 4, FATTO-2) nessun aggregato lo può
//    vedere, perché nessun aggregato vede i propri fratelli: serve la topologia.

import type { Decision } from "@lab/kernel";
import type { Instant } from "@lab/kernel/Instant";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import { maxDependentsPerControlUnit } from "../domain/Attachment";
import * as Device from "../domain/Device";
import type { DeviceEvent } from "../domain/DeviceEvent";
import type { DeviceId } from "../domain/DeviceId";
import * as Errors from "../domain/errors";
import type { Relation } from "../domain/Relation";
import * as Topology from "../domain/Topology";
import * as Repository from "../ports/DeviceRepository";

export type Input = {
  readonly deviceId: DeviceId;
  readonly parent: DeviceId;
  readonly relation: Relation;
};

export type Output = Decision<Device.Device, DeviceEvent>;

const load = (
  id: DeviceId,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, Errors.RegistryError, Device.Device> =>
  pipe(Repository.findById(id), RTE.flatMapEither(E.fromOption(() => Errors.deviceNotFound(id))));

const withinDependentLimit = (parent: Device.Device, child: Device.Device, topology: Topology.Topology): boolean =>
  parent.kind !== "ControlUnit" ||
  Topology.dependentsOf(topology, parent.id).filter((id) => id !== child.id).length < maxDependentsPerControlUnit;

const decide = (
  device: Device.Device,
  parent: Device.Device,
  relation: Relation,
  topology: Topology.Topology,
  now: Instant,
): E.Either<Errors.RegistryError, Output> => {
  const attached: E.Either<Errors.RegistryError, Output> = Device.attach(device, parent, relation, now);
  return E.isLeft(attached) || withinDependentLimit(parent, device, topology)
    ? attached
    : E.left(Errors.tooManyDependents(parent.id, maxDependentsPerControlUnit));
};

export const execute = (
  input: Input,
  now: Instant,
): RTE.ReaderTaskEither<Repository.DeviceRepositoryEnv, Errors.RegistryError, Output> =>
  pipe(
    RTE.Do,
    RTE.apSW("device", load(input.deviceId)),
    RTE.apSW("parent", load(input.parent)),
    RTE.apSW("topology", Repository.topology()),
    RTE.flatMapEither(({ device, parent, topology }) => decide(device, parent, input.relation, topology, now)),
    RTE.tap((decision) => Repository.save(decision.state)),
  );
