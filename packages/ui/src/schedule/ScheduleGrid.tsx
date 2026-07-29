/** biome-ignore-all lint/suspicious/noArrayIndexKey: griglia statica 7x24 */
import { Box, Tooltip, Typography } from "@mui/material";
import type { ComposedStep, ScheduleOp } from "@supervisor/core/schedule/codec";
import * as Schedule from "@supervisor/core/schedule/schedule";
import { Fragment, useMemo } from "react";

const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const OP_SYMBOLS: Record<ScheduleOp, string> = { union: "∪", intersection: "∩", subtract: "−" };

function computeGrid(schedule: Schedule.Schedule): number[][] {
  const grid: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let h = 0; h < 24; h++) {
      let active = 0;
      for (let m = 0; m < 60; m++) {
        if (schedule({ day: d, hour: h, minute: m })) active++;
      }
      row.push(active);
    }
    grid.push(row);
  }
  return grid;
}

function cellColor(activeMinutes: number): string {
  if (activeMinutes === 0) return "rgba(255,255,255,0.06)";
  if (activeMinutes === 60) return "#1b5e20";
  return `rgba(27, 94, 32, ${0.2 + (activeMinutes / 60) * 0.8})`;
}

function computeBreakdown(
  d: number,
  h: number,
  composed: readonly ComposedStep[],
  labels: readonly string[],
): string[] {
  return composed.map((step, i) => {
    let stepMins = 0;
    let cumulativeMins = 0;
    for (let m = 0; m < 60; m++) {
      const slot = { day: d, hour: h, minute: m };
      if (step.schedule(slot)) stepMins++;
      if (step.result(slot)) cumulativeMins++;
    }
    const prefix = i === 0 ? "" : `${OP_SYMBOLS[step.op]} `;
    return `${prefix}${labels[i] ?? "?"}: ${stepMins}min -> ${cumulativeMins}/60`;
  });
}

// Griglia 7gg x 24h a risoluzione del minuto: ogni cella e' colorata in base a quanti minuti
// dell'ora sono attivi nello Schedule composto - condivisa da ScheduleForm (anteprima live) e
// ScheduleView (risultato finale).
export interface ScheduleGridProps {
  readonly composed: readonly ComposedStep[];
  readonly labels: readonly string[];
}

export function ScheduleGrid({ composed, labels }: ScheduleGridProps) {
  const finalSchedule = composed.length > 0 ? composed[composed.length - 1]!.result : Schedule.never;
  const grid = useMemo(() => computeGrid(finalSchedule), [finalSchedule]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "32px repeat(24, 1fr)",
        gap: "1px",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 1,
        bgcolor: "#0a0c0e",
      }}
    >
      <Box />
      {HOURS.map((h) => (
        <Box key={h} sx={{ textAlign: "center" }}>
          {h % 3 === 0 && (
            <Typography sx={{ fontSize: 9, fontWeight: 600, color: "textSecondary" }}>
              {String(h).padStart(2, "0")}
            </Typography>
          )}
        </Box>
      ))}
      {grid.map((row, d) => (
        <Fragment key={DAY_NAMES[d]}>
          <Box sx={{ fontWeight: 600, display: "flex", alignItems: "center", fontSize: 9, color: "textSecondary" }}>
            {DAY_NAMES[d]}
          </Box>
          {row.map((mins, h) => {
            const breakdown = composed.length > 0 ? computeBreakdown(d, h, composed, labels) : [];
            const title = [`${DAY_NAMES[d]} ${String(h).padStart(2, "0")}:00 - ${mins}/60 min`, ...breakdown].join(
              "\n",
            );
            return (
              <Tooltip key={`${d}-${h}`} title={<span style={{ whiteSpace: "pre-line" }}>{title}</span>} arrow>
                <Box sx={{ aspectRatio: "1", bgcolor: cellColor(mins), borderRadius: 0.3, minWidth: 10 }} />
              </Tooltip>
            );
          })}
        </Fragment>
      ))}
    </Box>
  );
}
