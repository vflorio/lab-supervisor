import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { useState } from "react";
import { useLogFilters } from "./useLogFilters";

// Stato di visualizzazione condiviso tra la toolbar (Filters/Clear) e il corpo (pannello filtri +
// viewport) di una singola istanza di log view. Una entries stream in ingresso - quella del
// servizio oggi, quella di un singolo device domani - una istanza di questo hook: nessuno stato
// globale da condividere tra stream diversi.
export function useLogView(entries: readonly LogEntry[]) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const filters = useLogFilters(entries);

  // La cache di useDynamicRowHeight in LogViewport è per indice, non per entry: al cambio di
  // filtro gli stessi indici puntano a entry diverse e le altezze misurate non valgono più.
  const rowHeightKey = `${filters.minLevel}|${filters.search}|${[...filters.disabledTags].toSorted().join(",")}`;

  return {
    filters,
    filtersOpen,
    toggleFilters: () => setFiltersOpen((prev) => !prev),
    rowHeightKey,
  };
}
