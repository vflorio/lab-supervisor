import { TAG_PALETTE } from "@supervisor/core/logger/log-palette";
import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { isLevelEnabled, type LogLevel } from "@supervisor/core/logger/logger";
import { useEffect, useRef, useState } from "react";

// Stato di visualizzazione sopra il LogFeed condiviso: livello minimo, ricerca testuale, tag
// disabilitati e "clear" (solo DOM, non toccano le entries condivise con altri consumer).
export function useLogFilters(entries: readonly LogEntry[]) {
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const [search, setSearch] = useState("");
  const [disabledTags, setDisabledTags] = useState<ReadonlySet<string>>(new Set());
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [showTag, setShowTag] = useState(true);
  const [clearedBeforeId, setClearedBeforeId] = useState(-1);

  const knownTagsRef = useRef<Map<string, string | undefined>>(new Map());
  const lastScannedIdRef = useRef(-1);
  const [, bumpTagsVersion] = useState(0);

  useEffect(() => {
    const lastEntry = entries.at(-1);
    if (!lastEntry || lastEntry.id <= lastScannedIdRef.current) return;

    let changed = false;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      if (entry.id <= lastScannedIdRef.current) break;
      if (entry.tag && !knownTagsRef.current.has(entry.tag)) {
        knownTagsRef.current.set(
          entry.tag,
          entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined,
        );
        changed = true;
      }
    }
    lastScannedIdRef.current = lastEntry.id;
    if (changed) bumpTagsVersion((v) => v + 1);
  }, [entries]);

  const availableTags = knownTagsRef.current;

  const visibleEntries = entries.filter((entry) => entry.id > clearedBeforeId);
  const levelEntries = visibleEntries.filter((entry) => isLevelEnabled(minLevel, entry.level));

  const searchQuery = search.trim().toLowerCase();
  const hasActiveFilters = searchQuery !== "" || disabledTags.size > 0 || minLevel !== "debug";
  const filteredEntries = levelEntries.filter((entry) => {
    if (entry.tag && disabledTags.has(entry.tag)) return false;
    if (
      searchQuery &&
      !entry.message.toLowerCase().includes(searchQuery) &&
      !entry.tag?.toLowerCase().includes(searchQuery)
    ) {
      return false;
    }
    return true;
  });

  const toggleTag = (tag: string) => {
    setDisabledTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  // Se almeno un tag è disabilitato, il tasto li riabilita tutti; altrimenti li disabilita
  // tutti (comportamento a due stati, non un tri-state "parzialmente selezionato").
  const anyTagDisabled = disabledTags.size > 0;
  const toggleAllTags = () => {
    setDisabledTags(anyTagDisabled ? new Set() : new Set(availableTags.keys()));
  };

  const clearLogs = () => {
    setClearedBeforeId(entries.at(-1)?.id ?? clearedBeforeId);
  };

  return {
    visibleEntries,
    filteredEntries,
    hasActiveFilters,
    minLevel,
    setMinLevel,
    search,
    setSearch,
    disabledTags,
    toggleTag,
    anyTagDisabled,
    toggleAllTags,
    availableTags,
    showTimestamp,
    setShowTimestamp,
    showTag,
    setShowTag,
    clearLogs,
  };
}
