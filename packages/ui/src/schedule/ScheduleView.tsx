import { Alert, Stack, Typography } from "@mui/material";
import { compose, type ScheduleJson, type ScheduleOp, type ScheduleVerbJson } from "@supervisor/core/schedule/codec";
import * as E from "fp-ts/Either";
import { useMemo } from "react";
import { ScheduleGrid } from "./ScheduleGrid";

const OP_SYMBOLS: Record<ScheduleOp, string> = { union: "∪", intersection: "∩", subtract: "−" };

const formatVerb = (verb: ScheduleVerbJson): string => {
  const [name, ...args] = verb;
  return args.length > 0 ? `${name}(${args.join(", ")})` : name;
};

// Readonly: catena di step (stessa idea di RetryPolicyView) + griglia settimanale a
// risoluzione del minuto del risultato composto.
export interface ScheduleViewProps {
  readonly value: ScheduleJson;
}

export function ScheduleView({ value }: ScheduleViewProps) {
  const composed = useMemo(() => compose(value), [value]);

  if (E.isLeft(composed)) {
    return <Alert severity="error">{composed.left.message}</Alert>;
  }

  const labels = value.map(([, verb]) => formatVerb(verb));

  return (
    <Stack sx={{ gap: 1.5 }}>
      <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {value.map(([op, verb], index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: ScheduleJson non ha id, sola lettura
          <Stack key={index} direction="row" sx={{ gap: 0.75, alignItems: "center" }}>
            {index > 0 && (
              <Typography variant="caption" color="textSecondary">
                {OP_SYMBOLS[op]}
              </Typography>
            )}
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatVerb(verb)}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <ScheduleGrid composed={composed.right} labels={labels} />
    </Stack>
  );
}
