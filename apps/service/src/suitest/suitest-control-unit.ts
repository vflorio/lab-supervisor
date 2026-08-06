import * as Suitest from "@supervisor/core/adapters/suitest";
import type * as Facts from "@supervisor/core/fact/index";

// Suitest control-unit tracker - dominio "suitest-control-unit": determina se un device è
// offline a causa del Raspberry/Candybox a cui è connesso.
export const DOMAIN = "suitest-control-unit";
export const PREDICATE_ONLINE = "suitest_control_unit_online";

const keyOf = (item: Suitest.ControlUnit): string => item.id;

const toFacts = (item: Suitest.ControlUnit): Readonly<Record<string, Facts.FactValue>> => ({
  [PREDICATE_ONLINE]: item.online,
});

export const trackerConfig: Facts.TrackerConfig<Suitest.Env, Suitest.SuitestError, Suitest.ControlUnit> = {
  domain: DOMAIN,
  keyOf,
  toFacts,
  fetch: Suitest.getControlUnits,
};

export const isControlUnitOffline = (entry: Facts.FactEntry): boolean =>
  entry.domain === DOMAIN && entry.name === PREDICATE_ONLINE && entry.value === false;
