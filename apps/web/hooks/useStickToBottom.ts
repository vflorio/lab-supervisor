import type { LogEntry } from "@supervisor/core/logger/log-stream";
import { useLayoutEffect, useRef, useState } from "react";
import type { DynamicRowHeight } from "react-window";
import { useListRef } from "react-window";

// `scrollToRow({ align: "end" })` calcola l'offset dalla cache interna delle altezze: per una
// riga appena arrivata, prima che ResizeObserver misuri la sua altezza reale, quella cache è
// ancora la stima di default, quindi l'offset calcolato è quello sbagliato e le righe si
// sovrappongono per un frame. `element.scrollTop = element.scrollHeight` non passa da quella
// cache: legge l'altezza vera già renderizzata dal DOM, quindi è corretto sia al primo giro
// sia quando la cache si aggiorna in modo asincrono (da cui la dipendenza da `dynamicRowHeight`
// - la sua identità cambia ad ogni misurazione, ed è quello il segnale per ri-agganciarsi).
export function useStickToBottom(entries: readonly LogEntry[], dynamicRowHeight: DynamicRowHeight, enabled: boolean) {
  const listRef = useListRef(null);
  const stickToBottomRef = useRef(true);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  useLayoutEffect(() => {
    if (!enabled || !stickToBottomRef.current || entries.length === 0) return;
    const element = listRef.current?.element;
    if (element) element.scrollTop = element.scrollHeight;
  }, [entries, dynamicRowHeight, enabled, listRef]);

  const handleRowsRendered = (visible: { startIndex: number; stopIndex: number }) => {
    const atBottom = entries.length === 0 || visible.stopIndex >= entries.length - 1;
    stickToBottomRef.current = atBottom;
    setStuckToBottom(atBottom);
  };

  const scrollToBottom = () => {
    const element = listRef.current?.element;
    if (entries.length === 0 || !element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    stickToBottomRef.current = true;
    setStuckToBottom(true);
  };

  return { listRef, stuckToBottom, handleRowsRendered, scrollToBottom };
}
