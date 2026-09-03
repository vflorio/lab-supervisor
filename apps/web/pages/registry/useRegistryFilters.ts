import { usePersistedState } from "@supervisor/ui/misc/usePersistedState";
import { useState } from "react";
import type { DeviceKind } from "./types";

export type SortBy = "name" | "ip";
export type VisibleType = DeviceKind | "smartplug";
export type TriState = boolean | null; // null = filtro non attivo

const ALL_VISIBLE_TYPES: readonly VisibleType[] = ["candybox", "tv", "camera", "smartplug"];

const sortByCodec = {
  serialize: (value: SortBy) => value,
  deserialize: (raw: string) => (raw === "name" || raw === "ip" ? raw : undefined),
};

const visibleTypesCodec = {
  serialize: (value: ReadonlySet<VisibleType>) => JSON.stringify([...value]),
  deserialize: (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((v) => ALL_VISIBLE_TYPES.includes(v))) : undefined;
    } catch {
      return undefined;
    }
  },
};

// Stato di visualizzazione della Homepage (sort, toggle per tipo device, filtri) - sort e
// toggle sono preferenze di layout (persistite come collapsed/width altrove), i filtri sono
// stato di sessione effimero come search/minLevel in useLogFilters (si resettano al reload).
export function useRegistryFilters() {
  const [sortBy, setSortBy] = usePersistedState<SortBy>("registry:sortBy", "name", sortByCodec);
  const [visibleTypes, setVisibleTypes] = usePersistedState<ReadonlySet<VisibleType>>(
    "registry:visibleTypes",
    new Set(ALL_VISIBLE_TYPES),
    visibleTypesCodec,
  );
  const [controlled, setControlled] = useState<TriState>(null);
  const [inUse, setInUse] = useState<TriState>(null);
  const [errorKinds, setErrorKinds] = useState<ReadonlySet<string>>(new Set());

  const toggleType = (type: VisibleType) => {
    const next = new Set(visibleTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setVisibleTypes(next);
  };

  const toggleErrorKind = (kind: string) => {
    const next = new Set(errorKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setErrorKinds(next);
  };

  // true -> false -> non attivo (null) -> true - ciclo a 3 stati per un singolo chip cliccabile.
  const cycleTriState = (current: TriState): TriState => (current === null ? true : current === true ? false : null);

  return {
    sortBy,
    setSortBy,
    visibleTypes,
    toggleType,
    controlled,
    toggleControlled: () => setControlled(cycleTriState(controlled)),
    inUse,
    toggleInUse: () => setInUse(cycleTriState(inUse)),
    errorKinds,
    toggleErrorKind,
  };
}

export type RegistryFilters = ReturnType<typeof useRegistryFilters>;

// Predicato di visibilità di una riga: type toggle + filtri, indipendente dalla gerarchia (una
// riga nascosta non nasconde i propri children, vedi ControlUnitCard/TvRow `showRow`).
export function matchesFilters(
  filters: RegistryFilters,
  kind: DeviceKind,
  entry: { readonly controlled: boolean },
  errorKindsOfRow: readonly string[],
  inUseValue?: boolean,
): boolean {
  if (!filters.visibleTypes.has(kind)) return false;
  if (filters.controlled !== null && entry.controlled !== filters.controlled) return false;
  if (filters.inUse !== null && inUseValue !== filters.inUse) return false;
  if (filters.errorKinds.size > 0 && !errorKindsOfRow.some((k) => filters.errorKinds.has(k))) return false;
  return true;
}
