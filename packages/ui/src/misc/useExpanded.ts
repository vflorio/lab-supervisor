import { useState } from "react";
import { useUiSettings } from "./UiSettings";

export interface ExpandedSet {
  readonly isExpanded: (key: string) => boolean;
  readonly toggle: (key: string) => void;
  readonly expand: (key: string) => void;
}

// Traccia solo le eccezioni al default globale (UiSettings.defaultExpanded), non lo stato
// espanso per intero: cosi' un item aggiunto dopo il mount (es. nuova policy) eredita il
// default corrente invece di restare bloccato sullo stato iniziale del componente.
export function useExpanded(): ExpandedSet {
  const { defaultExpanded = false } = useUiSettings();
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(new Set());

  const isExpanded = (key: string) => overrides.has(key) !== defaultExpanded;

  const toggle = (key: string) =>
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const expand = (key: string) =>
    setOverrides((prev) => {
      if (prev.has(key) !== defaultExpanded) return prev;
      return new Set(prev).add(key);
    });

  return { isExpanded, toggle, expand };
}
