import * as Suitest from "@supervisor/core/adapters/suitest";
import type * as Facts from "@supervisor/core/fact/index";

// Suitest device tracker - dominio "suitest-device": status (enum) e presenza di inUseBy
export const DOMAIN = "suitest-device";
export const STATUS = "suitest_device_status";

const keyOf = (item: Suitest.Device): string => item.deviceId;

const toFacts = (item: Suitest.Device): Readonly<Record<string, Facts.FactValue>> => ({
  [STATUS]: item.status,
  suitest_device_in_use: item.inUseBy != null,
});

export const trackerConfig: Facts.TrackerConfig<Suitest.Env, Suitest.SuitestError, Suitest.Device> = {
  domain: DOMAIN,
  keyOf,
  toFacts,
  fetch: Suitest.getAllDevices,
};
