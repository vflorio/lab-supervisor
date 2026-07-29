import * as t from "io-ts";
import { ControlUnitCodec, DeviceCodec, VideoCaptureDeviceCodec } from "../adapters/suitest";

// Mirror locale (in sola lettura) dei dati grezzi Suitest, indicizzati per id. Nessun campo
// applicativo (label/controlled/ip) vive qui: solo il formato originale dell'API Suitest. Le
// chiavi sono anche la foreign key usata dal dominio applicativo (lab-registry).

export const SuitestStoreCodec = t.type({
  devices: t.record(t.string, DeviceCodec),
  controlUnits: t.record(t.string, ControlUnitCodec),
  videoCaptureDevices: t.record(t.string, VideoCaptureDeviceCodec),
});

export type SuitestStore = t.TypeOf<typeof SuitestStoreCodec>;

export const empty: SuitestStore = { devices: {}, controlUnits: {}, videoCaptureDevices: {} };
