// Chi produce i `ProbeOutcome`: legge dall'anagrafica i device monitorati, li espande nelle facce
// che quel kind espone (`facetsOf`) e le sonda tutte insieme, poi consegna il lotto a
// `RecordProbeResults` — l'unico posto in cui l'anti-flapping decide.
// Fuori, in `apps/`, resta solo il `setInterval`: la cadenza è un adapter driving, *cosa* sondare no.
// Un device non monitorato — o ritirato, che qui è la stessa cosa — non viene sondato affatto, e
// così non entra in nessun conto a valle (INV-11). Una custodia da operatore invece non toglie
// niente: guardare non è comandare, e un device in maintenance hold resta osservato.

import type { Device } from "@lab/registry/domain/Device";
import * as DeviceKind from "@lab/registry/domain/DeviceKind";
import * as DeviceRepository from "@lab/registry/ports/DeviceRepository";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as Facet from "../domain/Facet";
import * as FacetRef from "../domain/FacetRef";
import type { FlappingPolicy } from "../domain/FlappingPolicy";
import type * as Repository from "../ports/FacetHealthRepository";
import * as HealthProbe from "../ports/HealthProbePort";
import * as RecordProbeResults from "./RecordProbeResults";

export type Env = DeviceRepository.DeviceRepositoryEnv &
  HealthProbe.HealthProbeEnv &
  Repository.FacetHealthRepositoryEnv;

export type Output = RecordProbeResults.Output;

const monitored: RTE.ReaderTaskEither<DeviceRepository.DeviceRepositoryEnv, never, ReadonlyArray<Device>> = pipe(
  RTE.traverseArray(DeviceRepository.findByKind)(DeviceKind.all),
  RTE.map(RA.flatten),
  RTE.map(RA.filter((device: Device) => device.monitored)),
);

const facesOf = (device: Device): ReadonlyArray<FacetRef.FacetRef> =>
  pipe(
    Facet.facetsOf(device.kind),
    RA.map((facet) => FacetRef.make(device.id, facet)),
  );

// Le sonde si attraversano in parallelo: sono indipendenti fra loro, e una che resta appesa non
// deve poter ritardare le altre (FATTO-12). Il timeout è dell'adapter, che traduce comunque
// tutto in un `ProbeOutcome` (A-6).
export const execute = (policy: FlappingPolicy): RTE.ReaderTaskEither<Env, never, Output> =>
  pipe(
    monitored,
    RTE.map(RA.flatMap(facesOf)),
    RTE.flatMap(RTE.traverseArray(HealthProbe.probe)),
    RTE.flatMap((outcomes) => RecordProbeResults.execute(outcomes, policy)),
  );
