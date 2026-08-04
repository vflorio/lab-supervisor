import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import type { ElementType, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import { usePersistedState } from "./usePersistedState";

export interface ResizablePanelProps {
  readonly handleSide: "left" | "right";
  // Chiave localStorage sotto cui persistere la dimensione scelta dall'utente - deve essere
  // univoca per ogni pannello resizabile della pagina
  readonly storageKey: string;
  // Dimensione usata finché il valore persistito non è stato idratato (e per un utente al
  // primo utilizzo, che non ne ha ancora salvato uno)
  readonly defaultSize: number;
  readonly minSize?: number;
  // Quando true, ignora `size` e mostra una striscia stretta larga `collapsedSize`, senza
  // drag handle - stesso pattern di collasso della Sidebar, applicato a un pannello
  // ridimensionabile. Lo stato collapsed/expanded resta a carico del chiamante.
  readonly collapsed?: boolean;
  readonly collapsedSize?: number;
  readonly component?: ElementType;
  readonly sx?: SxProps<Theme>;
  readonly children: ReactNode;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startSize: number;
  readonly activationTimer: ReturnType<typeof setTimeout>;
}

const HANDLE_HITBOX = 16;
const ACTIVATION_DELAY_MS = 250;

export function ResizablePanel({
  handleSide,
  storageKey,
  defaultSize,
  minSize = 160,
  collapsed = false,
  collapsedSize = minSize,
  component = "div",
  sx,
  children,
}: ResizablePanelProps) {
  const [size, resize] = usePersistedState(storageKey, defaultSize, {
    serialize: (value) => String(value),
    deserialize: (raw) => {
      const stored = Number(raw);
      return Number.isFinite(stored) && stored >= minSize ? stored : undefined;
    },
  });
  const dragRef = useRef<DragState | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    const activationTimer = setTimeout(() => {
      setIsActive(true);
      document.body.style.userSelect = "none";
    }, ACTIVATION_DELAY_MS);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSize: size,
      activationTimer,
    };
  };

  const handleDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId || !isActive) return;

    const deltaX = event.clientX - drag.startX;
    const rawSize = handleSide === "left" ? drag.startSize - deltaX : drag.startSize + deltaX;
    resize(Math.max(minSize, rawSize));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    clearTimeout(dragRef.current.activationTimer);
    dragRef.current = null;
    setIsActive(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

  return (
    <Box
      component={component}
      sx={{
        position: "relative",
        flexShrink: 0,
        width: collapsed ? collapsedSize : size,
        minWidth: 0,
        overflow: "hidden",
        // Nessuna transizione durante il drag - farebbe rincorrere il pointer al box invece di
        // seguirlo 1:1; si anima solo il passaggio collapsed/expanded.
        transition: isActive ? "none" : (t) => t.transitions.create("width"),
        ...sx,
      }}
    >
      {children}
      {!collapsed && (
        <Box
          onPointerDown={startDragging}
          onPointerMove={handleDragging}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [handleSide]: -HANDLE_HITBOX / 2,
            width: HANDLE_HITBOX,
            display: "flex",
            justifyContent: "center",
            cursor: "col-resize",
            zIndex: 1,
            "&:hover": { bgcolor: isActive ? undefined : "action.hover" },
          }}
        >
          <Box
            sx={{
              width: isActive ? 4 : 2,
              height: "100%",
              bgcolor: isActive ? "primary.main" : "transparent",
              transition: "width 0.1s, background-color 0.1s",
            }}
          />
        </Box>
      )}
    </Box>
  );
}
