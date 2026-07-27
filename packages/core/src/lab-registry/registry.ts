import * as t from "io-ts";
import { type AdbEntry, AdbEntryCodec } from "./adb";
import { type CameraEntry, CameraEntryCodec } from "./camera";
import { type CandyboxEntry, CandyboxEntryCodec } from "./candybox";
import { type TvEntry, TvEntryCodec } from "./tv";

// -------------------------------------------------------------------------------------
// Model - dominio applicativo (supervisor): quali device della rete ci interessano, con che
// label mostrarli e se attualmente controllati, indipendentemente dai dati Suitest. Il legame
// verso Suitest è la foreign key opzionale `videoCaptureDeviceId`/`ip` di ciascuna entry
// (tranne che per candybox/tv, la cui identità coincide con l'id Suitest). `adb` è il
// registro degli host ADB assegnabili manualmente, referenziato per id (es. `CameraEntry.adbId`).
// -------------------------------------------------------------------------------------

export const LabRegistryCodec = t.type({
  candyboxes: t.record(t.string, CandyboxEntryCodec),
  cameras: t.record(t.string, CameraEntryCodec),
  tvs: t.record(t.string, TvEntryCodec),
  adb: t.record(t.string, AdbEntryCodec),
});

export type LabRegistry = t.TypeOf<typeof LabRegistryCodec>;

export const empty: LabRegistry = { candyboxes: {}, cameras: {}, tvs: {}, adb: {} };

export interface LabRegistrySeed {
  readonly candyboxes?: readonly CandyboxEntry[];
  readonly cameras?: readonly CameraEntry[];
  readonly tvs?: readonly TvEntry[];
  readonly adb?: readonly AdbEntry[];
}
