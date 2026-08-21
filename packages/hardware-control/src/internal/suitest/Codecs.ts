// La forma dei dati Suitest, così come l'API li manda. Travaso quasi letterale di
// `legacy/core/src/adapters/suitest.ts`: quei codec sono stati scritti contro l'API vera e
// funzionano, quindi non si reimplementano (M-10).
// Vivono in `internal/` perché sono vocabolario straniero: `online`, `streamActive`, `CONTROLLABLE`
// non compaiono da nessuna parte fuori da questo package. Tradurli è tutto il mestiere dell'ACL.

import * as t from "io-ts";

// Stati in cui il device è disponibile per Suitest — che non vuol dire raggiungibile per noi:
// `OFF` e `OFFLINE` sono "non occupato", non "risponde". La traduzione è in `Reachability.ts`.
const DeviceAvailableStatusCodec = t.union([
  t.literal("CONTROLLABLE"),
  t.literal("OFF"),
  t.literal("OFFLINE"),
  t.literal("READY"),
]);

// Stati in cui il device è temporaneamente occupato.
const DeviceBusyStatusCodec = t.union([
  t.literal("API_CONTROLLED"),
  t.literal("CANDYBOX_UPDATE"),
  t.literal("CLEANUP"),
  t.literal("INTERACTIVE_MODE"),
  t.literal("MAINTENANCE"),
  t.literal("MANUAL_RUN"),
  t.literal("POWER_ON"),
  t.literal("RESTARTING"),
  t.literal("SHUTDOWN"),
  t.literal("SUITEST_DRIVE_UPDATE"),
  t.literal("TESTING"),
]);

// Stati che richiedono intervento manuale.
const DeviceErrorStatusCodec = t.union([
  t.literal("BLASTER_ERROR"),
  t.literal("CANDYBOX_OFFLINE"),
  t.literal("CANNOT_TURN_ON"),
  t.literal("DISABLED"),
  t.literal("DRIVER_FAILURE"),
  t.literal("DRIVER_INIT_FAILURE"),
  t.literal("INTERNAL_FAILURE"),
  t.literal("NOT_CONFIGURED"),
  t.literal("SUITESTDRIVE_OFFLINE"),
  t.literal("SUITESTDRIVE_SERVICE_OFFLINE"),
]);

export const DeviceStatusCodec = t.union([DeviceAvailableStatusCodec, DeviceBusyStatusCodec, DeviceErrorStatusCodec]);

export type DeviceStatus = t.TypeOf<typeof DeviceStatusCodec>;

const InUseByCodec = t.partial({
  email: t.string,
  orgName: t.string,
  tokenName: t.string,
});

const CustomUserInfoCodec = t.partial({
  location: t.string,
  team: t.string,
  responsibleUser: t.string,
  osInfo: t.string,
  otherInfo: t.string,
});

// Device (TV, smart plug, ...). `controlUnitIds` è un array lato API, ma nel lab la relazione è
// 1-a-molti (FATTO-2): a imporlo è il registry, non questo codec, che deve restare fedele al mittente.
const DeviceRequiredCodec = t.type({
  deviceId: t.string,
  manufacturer: t.string,
  model: t.string,
  owner: t.string,
  firmware: t.string,
  customName: t.string,
  ipAddress: t.string,
  controlUnitIds: t.array(t.string),
  status: DeviceStatusCodec,
  modelId: t.string,
  platforms: t.array(t.string),
});

const DeviceOptionalCodec = t.partial({
  osVersion: t.string,
  inactivityTimeout: t.number,
  customUserInfo: CustomUserInfoCodec,
  inUseBy: InUseByCodec,
});

export const DeviceCodec = t.intersection([DeviceRequiredCodec, DeviceOptionalCodec]);

export type Device = t.TypeOf<typeof DeviceCodec>;

export const ControlUnitTypeCodec = t.union([
  t.literal("candybox"),
  t.literal("drive"),
  t.literal("personal-pi"),
  t.literal("solo-candy"),
]);

const ControlUnitRequiredCodec = t.type({
  id: t.string,
  name: t.string,
  online: t.boolean,
  type: ControlUnitTypeCodec,
});

// `reboot` e `shutdown` sono per singola unità: non tutte le CU si riavviano (FATTO-1). Sono
// opzionali perché SuitestDrive non li espone affatto.
const ControlUnitOptionalCodec = t.partial({
  reboot: t.boolean,
  shutdown: t.boolean,
  ip: t.string,
  osName: t.string,
  osVersion: t.string,
});

export const ControlUnitCodec = t.intersection([ControlUnitRequiredCodec, ControlUnitOptionalCodec]);

export type ControlUnit = t.TypeOf<typeof ControlUnitCodec>;

export const ControlUnitsResponseCodec = t.array(ControlUnitCodec);

const VideoCaptureDeviceTypeCodec = t.union([t.literal("android-app"), t.literal("usb-camera")]);

const BatteryStateCodec = t.partial({
  isCharging: t.boolean,
  batteryLevel: t.number,
  batteryTemperature: t.number,
});

// `online` e `streamActive` sono le due letture che compongono la faccia `StreamAvailable` di una
// camera (FATTO-8). `recordingActive` non ci riguarda in questo giro (NO-15).
const VideoCaptureDeviceRequiredCodec = t.type({
  id: t.string,
  type: VideoCaptureDeviceTypeCodec,
  name: t.string,
  assignedDeviceId: t.string,
  online: t.boolean,
  recordingActive: t.boolean,
  streamActive: t.boolean,
});

// customName/needsUpdate/batteryState non sono garantiti dallo swagger ufficiale (batteryState
// esiste solo per app android online).
const VideoCaptureDeviceOptionalCodec = t.partial({
  customName: t.string,
  needsUpdate: t.boolean,
  batteryState: BatteryStateCodec,
});

export const VideoCaptureDeviceCodec = t.intersection([
  VideoCaptureDeviceRequiredCodec,
  VideoCaptureDeviceOptionalCodec,
]);

export type VideoCaptureDevice = t.TypeOf<typeof VideoCaptureDeviceCodec>;

// L'involucro paginato della Public API: `values` più i puntatori di pagina.
export const PaginatedCodec = <C extends t.Mixed>(itemCodec: C) =>
  t.intersection([
    t.type({ values: t.array(itemCodec) }),
    t.partial({
      total: t.number,
      page: t.number,
      pagelen: t.number,
      next: t.string,
      previous: t.string,
    }),
  ]);
