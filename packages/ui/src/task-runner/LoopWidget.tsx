import { Box, Stack, Typography } from "@mui/material";
import { useLayoutEffect, useState } from "react";
import { StatusPill } from "../registry/StatusPill";
import { type LoopState, loopTone } from "./types";

function formatAge(ms: number): string {
  if (ms < 2_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "overdue";
  if (ms < 1_000) return "<1s";
  if (ms < 60_000) return `in ${Math.ceil(ms / 1_000)}s`;
  return `in ${Math.ceil(ms / 60_000)}m`;
}

export interface LoopWidgetProps {
  readonly id: string;
  readonly label: string;
  readonly state: LoopState;
  readonly iteration: number;
  readonly lastTickAt?: number;
  readonly nextTickAt?: number;
  readonly delayMs?: number;
  readonly policyLabel: string;
  readonly detail?: string;
  readonly now?: number;
}

export function LoopWidget({
  label,
  state,
  iteration,
  lastTickAt,
  nextTickAt,
  delayMs,
  policyLabel,
  detail,
  now: nowProp,
}: LoopWidgetProps) {
  const [clock, setClock] = useState(() => nowProp ?? Date.now());

  useLayoutEffect(() => {
    if (nowProp !== undefined) {
      setClock(nowProp);
      return;
    }
    const id = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [nowProp]);

  const tone = loopTone(state);
  const lastAge = lastTickAt !== undefined ? clock - lastTickAt : undefined;
  const nextIn = nextTickAt !== undefined ? nextTickAt - clock : undefined;
  const progress = delayMs && nextIn !== undefined ? Math.max(0, Math.min(1, 1 - nextIn / delayMs)) : undefined;

  return (
    <Stack
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
        justifyContent: "space-between",
        p: 1.5,
        gap: 1.25,
        width: 240,
        flexShrink: 0,
      }}
    >
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
        <Typography variant="monoEyebrow" color="textSecondary" sx={{ lineHeight: 1.3 }}>
          {label}
        </Typography>
      </Stack>

      <Box sx={{ height: 2, borderRadius: 999, overflow: "hidden", bgcolor: "divider" }}>
        {progress ? (
          <Box
            sx={{
              height: "100%",
              width: `${progress * 100}%`,
              bgcolor: tone === "disabled" ? "text.disabled" : `${tone}.main`,
              transition: "width 1s linear",
            }}
          />
        ) : null}
      </Box>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Box>
          <Typography variant="monoEyebrow" color="textSecondary" sx={{ display: "block" }}>
            Tick
          </Typography>
          <Typography variant="emphasizedValue">#{iteration}</Typography>
        </Box>
        {lastAge !== undefined && (
          <Box>
            <Typography variant="monoEyebrow" color="textSecondary" sx={{ display: "block" }}>
              Last
            </Typography>
            <Typography variant="monoLabel" color="textSecondary">
              {formatAge(lastAge)}
            </Typography>
          </Box>
        )}
        {nextIn !== undefined && (
          <Box>
            <Typography variant="monoEyebrow" color="textSecondary" sx={{ display: "block" }}>
              Next
            </Typography>
            <Typography variant="monoLabel" sx={{ color: nextIn < 0 ? "warning.main" : "text.primary" }}>
              {formatCountdown(nextIn)}
            </Typography>
          </Box>
        )}
      </Stack>

      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", gap: 1 }}>
        <Stack>
          <Typography variant="monoLabel" color="textSecondary" noWrap>
            {policyLabel}
          </Typography>
          {detail && (
            <Typography variant="monoLabel" color="textSecondary" noWrap>
              {detail}
            </Typography>
          )}
        </Stack>
        <StatusPill label={state} tone={tone} />
      </Stack>
    </Stack>
  );
}
