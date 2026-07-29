import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import * as Network from "../network";
import type { LabRegistry } from "./registry";

// Target ADB registrato manualmente (host:port), referenziato per id da altre entità (es.
// CameraEntry.adbId). `id` coincide con la forma stringa del target (es. "192.168.1.4:5555"):
// è una chiave naturale, registrare due volte lo stesso target è quindi un upsert idempotente.

export const AdbEntryCodec = t.type({
  id: t.string,
  label: t.string,
  target: Network.Codec,
});

export type AdbEntry = t.TypeOf<typeof AdbEntryCodec>;

export const AdbUpdateInputCodec = t.intersection([t.type({ id: t.string }), t.partial({ label: t.string })]);

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
