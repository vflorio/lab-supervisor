import { Box, Stack, Typography } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import type { DayOfWeek } from "@supervisor/core/date-time";

const DAYS: readonly DayOfWeek[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT: Record<DayOfWeek, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mer",
  thursday: "Gio",
  friday: "Ven",
  saturday: "Sab",
  sunday: "Dom",
};
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const toMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export interface ScheduleGridProps {
  readonly value: ActivationSchedule;
}

export function ScheduleGrid({ value }: ScheduleGridProps) {
  const fromMin = toMinutes(value.from);
  const toMin = toMinutes(value.to);

  return (
    <Box>
      <Box
        sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden", bgcolor: "#0a0c0e" }}
      >
        <Box sx={{ display: "flex", borderBottom: "1px solid", borderColor: "divider" }}>
          <Box sx={{ width: 40, flexShrink: 0, borderRight: "1px solid", borderColor: "divider" }} />
          {HOURS.map((h) => (
            <Box key={h} sx={{ flex: 1, textAlign: "center", py: 1 }}>
              {h % 6 === 0 && (
                <Typography variant="monoLabel" sx={{ color: "textSecondary" }}>
                  {String(h).padStart(2, "0")}
                </Typography>
              )}
            </Box>
          ))}
        </Box>
        {DAYS.map((day) => {
          const active = value.days.includes(day);
          return (
            <Box
              key={day}
              sx={{
                display: "flex",
                borderBottom: "1px solid",
                borderColor: "divider",
                "&:last-child": { borderBottom: 0 },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  flexShrink: 0,
                  borderRight: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  py: 0.75,
                }}
              >
                <Typography variant="monoLabel" sx={{ color: active ? "text.primary" : "text.disabled" }}>
                  {DAY_SHORT[day]}
                </Typography>
              </Box>
              {HOURS.map((h) => {
                const hMin = h * 60;
                const hEnd = hMin + 60;
                const lit = active && hEnd > fromMin && hMin < toMin;
                return (
                  <Box
                    key={h}
                    sx={{
                      flex: 1,
                      height: 26,
                      borderRight: "1px solid rgba(255,255,255,0.04)",
                      "&:last-child": { borderRight: 0 },
                      bgcolor: lit ? "rgba(74,222,128,0.5)" : "transparent",
                      transition: "background-color 0.15s",
                    }}
                  />
                );
              })}
            </Box>
          );
        })}
      </Box>
      <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
        {[
          { color: "rgba(74,222,128,0.5)", label: `Attivo ${value.from}–${value.to}`, border: false },
          { color: "transparent", label: "Inattivo", border: true },
        ].map((l) => (
          <Stack key={l.label} direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: "2px",
                bgcolor: l.color,
                border: l.border ? "1px solid" : "none",
                borderColor: "divider",
              }}
            />
            <Typography variant="monoLabel" sx={{ color: "textSecondary" }}>
              {l.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
