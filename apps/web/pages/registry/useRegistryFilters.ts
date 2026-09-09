import { usePersistedState } from "@supervisor/ui/misc/usePersistedState";
import type { DeviceKind } from "./types";

export type SortBy = "name" | "ip";
export type VisibleType = DeviceKind | "smartplug";
export type TriState = boolean | null; // null = filtro non attivo

const ALL_VISIBLE_TYPES: readonly VisibleType[] = ["candybox", "tv", "camera", "smartplug"];
// SmartPlugs non sono ancora agganciate alla gerarchia (vedi hierarchy.ts): il toggle esiste
// già in UI ma parte disattivato di default.
const DEFAULT_VISIBLE_TYPES: readonly VisibleType[] = ["candybox", "tv", "camera"];

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

const triStateCodec = {
  serialize: (value: TriState) => (value === null ? "null" : String(value)),
  deserialize: (raw: string) => (raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : undefined),
};

const stringSetCodec = {
  serialize: (value: ReadonlySet<string>) => JSON.stringify([...value]),
  deserialize: (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? new Set(parsed) : undefined;
    } catch {
      return undefined;
    }
  },
};

// Stato di visualizzazione della Homepage (sort, toggle per tipo device, filtri) - tutto
// persistito in localStorage (stesso pattern del resizable panel), così i filtri sopravvivono
// al reload esattamente come layout/sort.
export function useRegistryFilters() {
  const [sortBy, setSortBy] = usePersistedState<SortBy>("registry:sortBy", "name", sortByCodec);
  const [visibleTypes, setVisibleTypes] = usePersistedState<ReadonlySet<VisibleType>>(
    "registry:visibleTypes",
    new Set(DEFAULT_VISIBLE_TYPES),
    visibleTypesCodec,
  );
  const [controlled, setControlled] = usePersistedState<TriState>("registry:controlled", null, triStateCodec);
  const [inUse, setInUse] = usePersistedState<TriState>("registry:inUse", null, triStateCodec);
  const [errorKinds, setErrorKinds] = usePersistedState<ReadonlySet<string>>(
    "registry:errorKinds",
    new Set(),
    stringSetCodec,
  );

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
