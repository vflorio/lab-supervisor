import type * as Predicates from "@supervisor/core/predicates/index";
import * as Suitest from "@supervisor/core/services/suitest";

// -------------------------------------------------------------------------------------
// Suitest device tracker - dominio "suitest-device": status (enum) e presenza di inUseBy
// -------------------------------------------------------------------------------------

export const DOMAIN = "suitest-device";

const keyOf = (item: Suitest.Device): string => item.deviceId;

const toFacts = (item: Suitest.Device): Readonly<Record<string, Predicates.PredicateValue>> => ({
  suitest_device_status: item.status,
  suitest_device_in_use: item.inUseBy != null,
});

export const trackerConfig: Predicates.TrackerConfig<Suitest.Env, Suitest.SuitestError, Suitest.Device> = {
  domain: DOMAIN,
  keyOf,
  toFacts,
  fetch: Suitest.getAllDevices,
};
