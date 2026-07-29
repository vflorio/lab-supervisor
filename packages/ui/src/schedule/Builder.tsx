/** biome-ignore-all lint/suspicious/noArrayIndexKey: static grid */
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { never, type Schedule } from "@supervisor/core/schedule";
import { useCallback, useMemo, useState } from "react";
import { type ComposedStep, composeSteps, type ScheduleStep, type StepOp } from "./interpret";
import { DAY_NAMES, VERBS } from "./verbs";

const OP_LABELS: Record<StepOp, { label: string; color: "success" | "primary" | "error" }> = {
  union: { label: "Unione", color: "success" },
  intersection: { label: "Intersezione", color: "primary" },
  subtract: { label: "Sottrazione", color: "error" },
};

const ALL_OPS: StepOp[] = ["union", "intersection", "subtract"];

// -------------------------------------------------------------------------------------
// Grid helpers
// -------------------------------------------------------------------------------------

function computeGrid(schedule: Schedule): number[][] {
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
  if (activeMinutes === 0) return "#e0e0e0";
  if (activeMinutes === 60) return "#1b5e20";
  const ratio = activeMinutes / 60;
  return `rgba(27, 94, 32, ${0.2 + ratio * 0.8})`;
}

// -------------------------------------------------------------------------------------
// Components
// -------------------------------------------------------------------------------------

function MiniGrid({ schedule, highlight }: { schedule: Schedule; highlight?: boolean }) {
  const grid = useMemo(() => computeGrid(schedule), [schedule]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "32px repeat(24, 1fr)",
        gap: "1px",
        fontSize: 10,
        border: highlight ? "2px solid #1976d2" : "1px solid #ccc",
        borderRadius: 1,
        p: 0.5,
      }}
    >
      <Box />
      {Array.from({ length: 24 }, (_, h) => (
        <Box key={h} sx={{ textAlign: "center", fontWeight: 600, color: "#888" }}>
          {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
        </Box>
      ))}
      {grid.map((row, d) => (
        <>
          <Box
            key={`l-${d}`}
            sx={{ fontWeight: 600, display: "flex", alignItems: "center", fontSize: 9, color: "#666" }}
          >
            {DAY_NAMES[d]}
          </Box>
          {row.map((mins, h) => (
            <Tooltip
              key={`${d}-${h}`}
              title={`${DAY_NAMES[d]} ${String(h).padStart(2, "0")}:00 - ${mins}/60 min`}
              arrow
            >
              <Box
                sx={{
                  aspectRatio: "1",
                  bgcolor: cellColor(mins),
                  borderRadius: 0.3,
                  minWidth: 10,
                }}
              />
            </Tooltip>
          ))}
        </>
      ))}
    </Box>
  );
}

// -------------------------------------------------------------------------------------
// Final grid with per-step breakdown tooltip
// -------------------------------------------------------------------------------------

const OP_SYMBOLS: Record<StepOp, string> = { union: "∪", intersection: "∩", subtract: "−" };

function computeBreakdown(
  d: number,
  h: number,
  steps: readonly ScheduleStep[],
  composed: readonly ComposedStep[],
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < composed.length; i++) {
    const step = steps[i];
    const c = composed[i];
    let stepMins = 0;
    let cumulativeMins = 0;
    for (let m = 0; m < 60; m++) {
      const slot = { day: d, hour: h, minute: m };
      if (step.schedule(slot)) stepMins++;
      if (c.result(slot)) cumulativeMins++;
    }
    const prefix = i === 0 ? "" : `${OP_SYMBOLS[step.op]} `;
    lines.push(`${prefix}${step.label}: ${stepMins}min -> ${cumulativeMins}/60`);
  }
  return lines;
}

function FinalGrid({ steps, composed }: { steps: readonly ScheduleStep[]; composed: readonly ComposedStep[] }) {
  const finalSchedule = composed.length > 0 ? composed[composed.length - 1].result : never;
  const grid = useMemo(() => computeGrid(finalSchedule), [finalSchedule]);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "32px repeat(24, 1fr)",
        gap: "1px",
        fontSize: 10,
        border: "2px solid #1976d2",
        borderRadius: 1,
        p: 0.5,
      }}
    >
      <Box />
      {Array.from({ length: 24 }, (_, h) => (
        <Box key={h} sx={{ textAlign: "center", fontWeight: 600, color: "#888" }}>
          {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
        </Box>
      ))}
      {grid.map((row, d) => (
        <>
          <Box
            key={`l-${d}`}
            sx={{ fontWeight: 600, display: "flex", alignItems: "center", fontSize: 9, color: "#666" }}
          >
            {DAY_NAMES[d]}
          </Box>
          {row.map((mins, h) => {
            const breakdown = computeBreakdown(d, h, steps, composed);
            const title = [
              `${DAY_NAMES[d]} ${String(h).padStart(2, "0")}:00 - ${mins}/60 min`,
              "─".repeat(30),
              ...breakdown,
            ].join("\n");
            return (
              <Tooltip
                key={`${d}-${h}`}
                title={<span style={{ whiteSpace: "pre-line", fontSize: 11 }}>{title}</span>}
                arrow
              >
                <Box
                  sx={{
                    aspectRatio: "1",
                    bgcolor: cellColor(mins),
                    borderRadius: 0.3,
                    minWidth: 10,
                  }}
                />
              </Tooltip>
            );
          })}
        </>
      ))}
    </Box>
  );
}

// -------------------------------------------------------------------------------------
// Add-step dialog
// -------------------------------------------------------------------------------------

function AddStepDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (step: ScheduleStep) => void;
}) {
  const [verbId, setVerbId] = useState(VERBS[0].id);
  const [op, setOp] = useState<StepOp>("union");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const verb = VERBS.find((v) => v.id === verbId) ?? VERBS[0];

  const currentValues = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of verb.fields) {
      out[f.name] = fieldValues[f.name] ?? f.defaultValue;
    }
    return out;
  }, [verb, fieldValues]);

  const preview = useMemo(() => {
    try {
      return verb.build(currentValues);
    } catch {
      return null;
    }
  }, [verb, currentValues]);

  const handleAdd = () => {
    if (!preview) return;
    onAdd({ label: preview.label, schedule: preview.schedule, op });
    setFieldValues({});
    onClose();
  };

  const handleVerbChange = (id: string) => {
    setVerbId(id);
    setFieldValues({});
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Aggiungi step</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <FormControl fullWidth size="small">
          <InputLabel>Operazione</InputLabel>
          <Select value={op} label="Operazione" onChange={(e) => setOp(e.target.value as StepOp)}>
            {ALL_OPS.map((o) => (
              <MenuItem key={o} value={o}>
                {OP_LABELS[o].label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <InputLabel>Tipo schedule</InputLabel>
          <Select value={verbId} label="Tipo schedule" onChange={(e) => handleVerbChange(e.target.value)}>
            {VERBS.map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {verb.fields.map((f) => {
          if (f.type === "day") {
            return (
              <FormControl key={f.name} fullWidth size="small">
                <InputLabel>{f.label}</InputLabel>
                <Select
                  value={currentValues[f.name]}
                  label={f.label}
                  onChange={(e) => setFieldValues((p) => ({ ...p, [f.name]: e.target.value }))}
                >
                  {DAY_NAMES.map((name, i) => (
                    <MenuItem key={i} value={String(i)}>
                      {name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            );
          }
          return (
            <TextField
              key={f.name}
              label={f.label}
              size="small"
              type={f.type === "time" ? "time" : "number"}
              value={currentValues[f.name]}
              onChange={(e) => setFieldValues((p) => ({ ...p, [f.name]: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          );
        })}

        {preview && (
          <Box>
            <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>
              Anteprima: {preview.label}
            </Typography>
            <MiniGrid schedule={preview.schedule} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!preview}>
          Aggiungi
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// -------------------------------------------------------------------------------------
// Step card
// -------------------------------------------------------------------------------------

function StepCard({
  step,
  index,
  total,
  resultSchedule,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChangeOp,
}: {
  step: ScheduleStep;
  index: number;
  total: number;
  resultSchedule: Schedule;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChangeOp: (op: StepOp) => void;
}) {
  const isFirst = index === 0;

  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 280, flexShrink: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, color: "#888", minWidth: 24 }}>
          {index + 1}.
        </Typography>
        {!isFirst ? (
          <Select
            size="small"
            value={step.op}
            onChange={(e) => onChangeOp(e.target.value as StepOp)}
            sx={{ minWidth: 150, height: 28, fontSize: 13 }}
          >
            {ALL_OPS.map((o) => (
              <MenuItem key={o} value={o}>
                {OP_LABELS[o].label}
              </MenuItem>
            ))}
          </Select>
        ) : (
          <Chip label="Base" size="small" variant="outlined" />
        )}
        <Typography variant="body1" sx={{ fontWeight: 600, flex: 1 }}>
          {step.label}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton size="small" disabled={index === 0} onClick={onMoveUp} title="Sposta su">
            <span> ← </span>
          </IconButton>
          <IconButton size="small" disabled={index === total - 1} onClick={onMoveDown} title="Sposta giù">
            <span> → </span>
          </IconButton>
          <IconButton size="small" onClick={onRemove} title="Rimuovi" sx={{ color: "error.main" }}>
            <span> ✕ </span>
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box>
          <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>
            {isFirst ? "Schedule" : "Step"}
          </Typography>
          <MiniGrid schedule={step.schedule} />
        </Box>
        <Box>
          <Typography variant="caption" sx={{ color: "#888", mb: 0.5, display: "block" }}>
            Risultato composizione
          </Typography>
          <MiniGrid schedule={resultSchedule} highlight />
        </Box>
      </Box>
    </Paper>
  );
}

export interface BuilderPreset {
  readonly name: string;
  readonly description: string;
  readonly steps: ScheduleStep[];
}

export function Builder({ presets }: { presets: BuilderPreset[] }) {
  const [steps, setSteps] = useState<ScheduleStep[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const composed = useMemo(() => composeSteps(steps), [steps]);

  const moveStep = useCallback((from: number, to: number) => {
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const removeStep = useCallback((index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const changeOp = useCallback((index: number, op: StepOp) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, op } : s)));
  }, []);

  const addStep = useCallback((step: ScheduleStep) => {
    setSteps((prev) => [...prev, step]);
  }, []);

  return (
    <>
      <Box sx={{ mx: "auto", p: 3 }}>
        <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 700 }}>
          Schedule Builder
        </Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)}>
            + Aggiungi step
          </Button>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Carica esempio</InputLabel>
            <Select
              value=""
              label="Carica esempio"
              onChange={(e) => {
                const preset = presets.find((p) => p.name === e.target.value);
                if (preset) setSteps(preset.steps);
              }}
            >
              {presets.map((p) => (
                <MenuItem key={p.name} value={p.name}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "#888" }}>
                      {p.description}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {steps.length > 0 && (
            <Button variant="outlined" size="small" color="error" onClick={() => setSteps([])}>
              Svuota
            </Button>
          )}
        </Box>

        {steps.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", color: "#999", border: "2px dashed #ccc" }}>
            <Typography variant="body1">Nessuno step. Aggiungi il primo o carica l'esempio.</Typography>
          </Paper>
        ) : (
          <>
            <Box sx={{ display: "flex", flexDirection: "row", gap: 1.5, overflowX: "auto", pb: 1 }}>
              {composed.map((c, i) => (
                <StepCard
                  key={i}
                  step={steps[i]}
                  index={i}
                  total={steps.length}
                  resultSchedule={c.result}
                  onMoveUp={() => moveStep(i, i - 1)}
                  onMoveDown={() => moveStep(i, i + 1)}
                  onRemove={() => removeStep(i)}
                  onChangeOp={(op) => changeOp(i, op)}
                />
              ))}
            </Box>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 700 }}>
              Risultato
            </Typography>
            <Box sx={{ maxWidth: 900 }}>
              <FinalGrid steps={steps} composed={composed} />
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2, fontSize: 11 }}>
              <Box sx={{ width: 14, height: 14, bgcolor: "#e0e0e0", borderRadius: 0.5 }} /> 0 min
              <Box sx={{ width: 14, height: 14, bgcolor: "rgba(27,94,32,0.4)", borderRadius: 0.5 }} /> parziale
              <Box sx={{ width: 14, height: 14, bgcolor: "#1b5e20", borderRadius: 0.5 }} /> 60 min
            </Box>
          </>
        )}
      </Box>

      <AddStepDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAdd={addStep} />
    </>
  );
}
