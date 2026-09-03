import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import * as Network from "../network";
import type { LabRegistry } from "./registry";

// Target ADB registrato manualmente (IP), referenziato per id da altre entità (es.
// CameraEntry.adbId). `id` è un identificatore opaco - generato in fase di associazione o
// preconfigurato via seed - indipendente dal target di rete, che può quindi cambiare (device
// sostituito, nuovo IP) senza invalidare i riferimenti che lo usano. La porta non fa parte del
// target: è la stessa per tutti i device (config globale `adb.port`), risolta a valle da chi
// deve aprire una connessione.

export const AdbEntryCodec = t.type({
  id: t.string,
  target: Network.HostCodec,
});

export type AdbEntry = t.TypeOf<typeof AdbEntryCodec>;

export const AdbUpdateInputCodec = t.intersection([t.type({ id: t.string }), t.partial({ target: Network.HostCodec })]);

export type AdbUpdateInput = t.TypeOf<typeof AdbUpdateInputCodec>;

export const addAdbEntry =
  (entry: AdbEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    adb: { ...registry.adb, [entry.id]: entry },
  });

export const removeAdbEntryById =
  (id: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [id]: _removed, ...adb } = registry.adb;
    return { ...registry, adb };
  };

export const updateAdbEntryById =
  (id: string, update: Partial<Omit<AdbEntry, "id">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.adb[id];
    if (!existing) return registry;
    return { ...registry, adb: { ...registry.adb, [id]: { ...existing, ...update } } };
  };

export const findAdbEntryById =
  (id: string) =>
  (registry: LabRegistry): AdbEntry | undefined =>
    registry.adb[id];
