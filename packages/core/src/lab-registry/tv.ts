import * as Validation from "@supervisor/core/validation";
import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

// Identità = deviceId Suitest: come i Candybox, una TV non ha esistenza indipendente da
// Suitest (a differenza di Camera, che può essere preconfigurata offline), quindi `deviceId`
// è la chiave primaria obbligatoria; `ip` è un dato secondario opzionale.
export const TvEntryCodec = t.type({
  deviceId: t.string,
  label: t.string,
  controlled: t.boolean,
  ip: Validation.optionFromNullable(t.string),
});

export type TvEntry = t.TypeOf<typeof TvEntryCodec>;

export const TvUpdateInputCodec = t.intersection([
  t.type({ deviceId: t.string }),
  t.partial({ label: t.string, controlled: t.boolean, ip: Validation.optionFromNullable(t.string) }),
]);

export type TvUpdateInput = t.TypeOf<typeof TvUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - TVs
// -------------------------------------------------------------------------------------

export const addTv =
  (entry: TvEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    tvs: { ...registry.tvs, [entry.deviceId]: entry },
  });

export const removeTvByDeviceId =
  (deviceId: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [deviceId]: _removed, ...tvs } = registry.tvs;
    return { ...registry, tvs };
  };

export const updateTvByDeviceId =
  (deviceId: string, update: Partial<Omit<TvEntry, "deviceId">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.tvs[deviceId];
    if (!existing) return registry;
    return { ...registry, tvs: { ...registry.tvs, [deviceId]: { ...existing, ...update } } };
  };

export const findTvByDeviceId =
  (deviceId: string) =>
  (registry: LabRegistry): TvEntry | undefined =>
    registry.tvs[deviceId];
