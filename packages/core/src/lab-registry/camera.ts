import * as Validation from "@supervisor/core/validation";
import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

// Identità stabile locale (`id`): una camera Suitest non ha un IP (solo customName), e l'host
// ADB associato può cambiare/essere riassegnato, quindi non possono fungere da chiave primaria.
//
// `videoCaptureDeviceId`/`adbId` sono foreign key opzionali (verso suitest-store.videoCaptureDevices
// e verso lab.adb rispettivamente) modellate come `Option<string>`: la chiave è sempre presente,
// il valore può mancare (`null` a riposo) - a differenza di un `t.partial`, dove sarebbe la chiave
// stessa a poter mancare.
export const CameraEntryCodec = t.type({
  id: t.string,
  label: t.string,
  controlled: t.boolean,
  // Foreign key verso suitest-store.videoCaptureDevices[id], impostata manualmente in fase di
  // riconciliazione via UI (una camera aggiunta a mano, es. un tablet, può non averla)
  videoCaptureDeviceId: Validation.optionFromNullable(t.string),
  // Foreign key verso lab.adb[id] - l'host ADB assegnato manualmente (es. un tablet)
  adbId: Validation.optionFromNullable(t.string),
});

export type CameraEntry = t.TypeOf<typeof CameraEntryCodec>;

export const CameraUpdateInputCodec = t.intersection([
  t.type({ id: t.string }),
  t.partial({
    label: t.string,
    controlled: t.boolean,
    videoCaptureDeviceId: Validation.optionFromNullable(t.string),
    adbId: Validation.optionFromNullable(t.string),
  }),
]);

export type CameraUpdateInput = t.TypeOf<typeof CameraUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - Cameras
// -------------------------------------------------------------------------------------

export const addCamera =
  (entry: CameraEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    cameras: { ...registry.cameras, [entry.id]: entry },
  });

export const removeCameraById =
  (id: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [id]: _removed, ...cameras } = registry.cameras;
    return { ...registry, cameras };
  };

export const updateCameraById =
  (id: string, update: Partial<Omit<CameraEntry, "id">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.cameras[id];
    if (!existing) return registry;
    return { ...registry, cameras: { ...registry.cameras, [id]: { ...existing, ...update } } };
  };

export const findCameraById =
  (id: string) =>
  (registry: LabRegistry): CameraEntry | undefined =>
    registry.cameras[id];
