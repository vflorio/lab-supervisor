import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useListCallbackRef } from "react-window";

// Le altezze sono misurate dopo il render, quindi scrollTop e scrollHeight non tornano al pixel.
const BOTTOM_EPSILON = 4;

const SCROLL_UP_KEYS = new Set(["ArrowUp", "PageUp", "Home"]);

function isAtBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_EPSILON;
}

// Ancoraggio al fondo di una lista virtualizzata che cresce dal basso.
//
// Lo sgancio è legato agli eventi di input, non alla posizione: sia il range renderizzato che
// scrollTop oscillano da soli mentre react-window misura le righe (la stima dell'altezza totale
// cambia e il browser clampa), e come segnale davano falsi positivi ad ogni log in arrivo. Il
// riaggancio invece è sulla posizione, che in fondo alla lista non è ambigua.
export function useStickToBottom() {
  const [list, listRef] = useListCallbackRef(null);
  const element = list?.element ?? null;

  const stuckRef = useRef(true);
  const [stuckToBottom, setStuckToBottom] = useState(true);
  // Premuto sull'elemento (tipicamente sulla scrollbar): sospende l'ancoraggio automatico.
  const draggingRef = useRef(false);

  const setStuck = useCallback((next: boolean) => {
    stuckRef.current = next;
    setStuckToBottom((prev) => (prev === next ? prev : next));
  }, []);

  const pin = useCallback((target: HTMLElement) => {
    target.scrollTop = target.scrollHeight;
  }, []);

  // Ad ogni commit, non una volta sola: ogni riga misurata sposta il fondo.
  useLayoutEffect(() => {
    if (!stuckRef.current || draggingRef.current || !element) return;
    pin(element);
  });

  useEffect(() => {
    if (!element) return;

    const onScroll = () => {
      if (isAtBottom(element)) {
        setStuck(true);
        return;
      }
      if (draggingRef.current) {
        setStuck(false);
        return;
      }
      // Ancorati ma non in fondo: react-window ha esteso la stima dell'altezza totale senza
      // ri-renderizzare, quindi nessun layout effect scatterebbe.
      if (stuckRef.current) pin(element);
    };

    // Precedono lo scroll che provocano: sganciare qui è sincrono, e impedisce che un log in
    // arrivo nello stesso frame riporti in fondo la lista mentre l'utente risale.
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) setStuck(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (SCROLL_UP_KEYS.has(event.key)) setStuck(false);
    };
    const onPointerDown = () => {
      draggingRef.current = true;
    };
    const onPointerUp = () => {
      draggingRef.current = false;
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("wheel", onWheel, { passive: true });
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("pointerdown", onPointerDown);
    // Il rilascio può avvenire fuori dall'elemento.
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [element, setStuck]);

  const scrollToBottom = useCallback(() => {
    setStuck(true);
    if (element) pin(element);
  }, [element, pin, setStuck]);

  return { listRef, stuckToBottom, scrollToBottom };
}
