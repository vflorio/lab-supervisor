// L'identità di ciò che si sonda: non "un device", ma una sua faccia. È la chiave con cui la
// salute viene indicizzata, confrontata e fotografata.

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type * as EqModule from "fp-ts/Eq";
import type { Facet } from "./Facet";

export type FacetRef = {
  readonly deviceId: DeviceId;
  readonly facet: Facet;
};

export const make = (deviceId: DeviceId, facet: Facet): FacetRef => ({ deviceId, facet });

export const key = (ref: FacetRef): string => `${ref.deviceId}#${ref.facet}`;

export const Eq: EqModule.Eq<FacetRef> = { equals: (a, b) => key(a) === key(b) };
