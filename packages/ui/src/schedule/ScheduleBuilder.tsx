import { Button, Stack, Typography } from "@mui/material";
import type { ScheduleJson, ScheduleStepSchema } from "@supervisor/core/schedule/codec";
import { SCHEDULE_TEMPLATES } from "@supervisor/core/schedule/templates";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleView } from "./ScheduleView";

// Compone, senza duplicarne la logica: la galleria di esempi (libreria di riferimento in
// ../../../core/src/schedule/templates) come punto di partenza, ScheduleForm come editor degli
// step, ScheduleView come anteprima live del risultato composto.
export interface ScheduleBuilderProps {
  readonly value: ScheduleJson;
  readonly onChange: (next: ScheduleJson) => void;
  readonly schema: readonly ScheduleStepSchema[];
}

export function ScheduleBuilder({ value, onChange, schema }: ScheduleBuilderProps) {
  return (
    <Stack sx={{ gap: 2 }}>
      <Stack sx={{ gap: 1 }}>
        <Typography variant="overline" color="textSecondary">
          Esempi
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          {SCHEDULE_TEMPLATES.map((template) => (
            <Button
              key={template.label}
              size="small"
              variant="outlined"
              title={template.description}
              onClick={() => onChange(template.json)}
            >
              {template.label}
            </Button>
          ))}
        </Stack>
      </Stack>
      <ScheduleForm value={value} onChange={onChange} schema={schema} />
      <Stack sx={{ gap: 1 }}>
        <Typography variant="overline" color="textSecondary">
          Anteprima
        </Typography>
        <ScheduleView value={value} />
      </Stack>
    </Stack>
  );
}
