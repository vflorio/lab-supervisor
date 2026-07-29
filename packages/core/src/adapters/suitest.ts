import * as Validation from "@supervisor/core/validation";
import { constVoid, pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import type * as Config from "../config";
import * as Errors from "../errors";
import * as HTTP from "../http";
import * as Logger from "../logger/logger";
import * as SuitestPaginate from "./suitest-paginate";

export type SuitestError = HTTP.HTTPError | Validation.ValidationError | SuitestPaginate.PaginationFetchError;

export interface Env {
  readonly suitestConfig: Config.Suitest;
  readonly logger?: Logger.Tagged;
}

const BASE_URL = "https://the.suite.st/api/public/v4";

const endpoint = (env: Env, path: string): string => `${env.suitestConfig.baseUrl ?? BASE_URL}${path}`;

// Stati in cui il device è disponibile
const DeviceAvailableStatusCodec = t.union([
  t.literal("CONTROLLABLE"),
  t.literal("OFF"),
  t.literal("OFFLINE"),
  t.literal("READY"),
]);

// Stati in cui il device è temporaneamente occupato
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

// Stati che richiedono intervento manuale
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

// Chi sta attualmente usando il device (o la TV) - presente solo se in uso
export const InUseByCodec = t.partial({
  email: t.string,
  orgName: t.string,
  tokenName: t.string,
});

export type InUseBy = t.TypeOf<typeof InUseByCodec>;

// Campi liberi configurabili dal proprietario del device (pass-through, mai interpretati da noi)
export const CustomUserInfoCodec = t.partial({
  location: t.string,
  team: t.string,
  responsibleUser: t.string,
  osInfo: t.string,
  otherInfo: t.string,
});

export type CustomUserInfo = t.TypeOf<typeof CustomUserInfoCodec>;

// Device (TV, smart plug, ...)
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

// Dettaglio singolo device (stessi campi senza deviceId, viene usata per la query)
// (questo codec lo dichiariamo per mimare lo swagger ufficiale)
const DeviceDetailRequiredCodec = t.type({
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

export const DeviceDetailCodec = t.intersection([DeviceDetailRequiredCodec, DeviceOptionalCodec]);

export type DeviceDetail = t.TypeOf<typeof DeviceDetailCodec>;

// Control Unit (CandyBox / Raspberry Pi / SuitestDrive)
const ControlUnitTypeCodec = t.union([
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

// Definiti solo per Raspberry Pi/CandyBox/WingBox (reboot/shutdown) o solo da SuitestDrive (osName/osVersion)
const ControlUnitOptionalCodec = t.partial({
  reboot: t.boolean,
  shutdown: t.boolean,
  ip: t.string,
  osName: t.string,
  osVersion: t.string,
});

export const ControlUnitCodec = t.intersection([ControlUnitRequiredCodec, ControlUnitOptionalCodec]);

export type ControlUnit = t.TypeOf<typeof ControlUnitCodec>;

const ControlUnitsResponseCodec = t.array(ControlUnitCodec);

// Video Capture Device (Android app / USB camera che cattura lo schermo di un device)
const VideoCaptureDeviceTypeCodec = t.union([t.literal("android-app"), t.literal("usb-camera")]);

export const BatteryStateCodec = t.partial({
  isCharging: t.boolean,
  batteryLevel: t.number,
  batteryTemperature: t.number,
});

export type BatteryState = t.TypeOf<typeof BatteryStateCodec>;

const VideoCaptureDeviceRequiredCodec = t.type({
  id: t.string,
  type: VideoCaptureDeviceTypeCodec,
  name: t.string,
  assignedDeviceId: t.string,
  online: t.boolean,
  recordingActive: t.boolean,
  streamActive: t.boolean,
});

// customName/needsUpdate/batteryState non sono garantiti dallo swagger ufficiale (es. batteryState
// esiste solo per app android online)
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

const loggedGet = (env: Env, path: string): TE.TaskEither<HTTP.HTTPError, unknown> => {
  const url = endpoint(env, path);
  return pipe(
    env.logger ? TE.fromIO(env.logger.debug(`GET ${url}`)) : TE.right(undefined),
    TE.flatMap(() => HTTP.getJsonAuth(url, env.suitestConfig)),
    TE.tapIO((data) =>
      env.logger ? env.logger.child("HTTP").logNetwork(Logger.formatJsonLog([{ response: data }])) : constVoid,
    ),
    TE.tapError((err) =>
      env.logger ? TE.fromIO(env.logger.error(`GET HTTPError: ${Errors.format(err)}`)) : TE.right(undefined),
    ),
  );
};

const loggedPost = (env: Env, path: string): TE.TaskEither<HTTP.HTTPError, unknown> => {
  const url = endpoint(env, path);
  return pipe(
    env.logger ? TE.fromIO(env.logger.debug(`POST ${url}`)) : TE.right(undefined),
    TE.flatMap(() => HTTP.postJsonBasic(url, env.suitestConfig)),
    TE.tapIO((data) =>
      env.logger ? env.logger.child("HTTP").logNetwork(Logger.formatJsonLog([{ response: data }])) : constVoid,
    ),
    TE.tapError((err) =>
      env.logger ? TE.fromIO(env.logger.error(`POST HTTPError: ${Errors.format(err)}`)) : TE.right(undefined),
    ),
  );
};

// TVs, Smart Plugs
export const getAllDevices = (env: Env): TE.TaskEither<SuitestError, readonly Device[]> =>
  pipe(
    SuitestPaginate.fetchAllPages(endpoint(env, "/devices"), env.suitestConfig, DeviceCodec, env.logger),
    TE.tapIO((devices) => (env.logger ? env.logger.debug(`  -> ${devices.length} devices total`) : () => {})),
    TE.tapError((err) =>
      env.logger ? TE.fromIO(env.logger.error(`/devices error: ${Errors.format(err)}`)) : TE.right(undefined),
    ),
  );

// Dettaglio di un singolo device
export const getDevice = (env: Env, deviceId: string): TE.TaskEither<SuitestError, DeviceDetail> =>
  pipe(
    loggedGet(env, `/devices/${encodeURIComponent(deviceId)}`),
    TE.flatMapEither(Validation.validate(DeviceDetailCodec)),
  );

// Lista di tutte le control unit (CandyBox, Raspberry Pi, ecc.)
export const getControlUnits = (env: Env): TE.TaskEither<SuitestError, readonly ControlUnit[]> =>
  pipe(loggedGet(env, "/control-units"), TE.flatMapEither(Validation.validate(ControlUnitsResponseCodec)));

export const getVideoCaptureDevices = (env: Env): TE.TaskEither<SuitestError, readonly VideoCaptureDevice[]> =>
  pipe(
    SuitestPaginate.fetchAllPages(
      endpoint(env, "/video-capture-devices"),
      env.suitestConfig,
      VideoCaptureDeviceCodec,
      env.logger,
    ),
    TE.tapIO((devices) =>
      env.logger ? env.logger.debug(`  -> ${devices.length} video capture devices total`) : () => {},
    ),
    TE.tapError((err) =>
      env.logger
        ? TE.fromIO(env.logger.error(`/video-capture-devices error: ${Errors.format(err)}`))
        : TE.right(undefined),
    ),
  );

// Riavvia una control unit (CandyBox/Raspberry Pi)
export const rebootControlUnit = (env: Env, controlId: string): TE.TaskEither<SuitestError, void> =>
  pipe(loggedPost(env, `/control-units/${encodeURIComponent(controlId)}/reboot`), TE.asUnit);
