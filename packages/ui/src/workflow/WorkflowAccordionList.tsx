import { Add, Bolt, ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Chip, IconButton, Stack, Typography } from "@mui/material";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { useEffect, useState } from "react";
import { CommandView } from "./CommandView";
import { WorkflowForm } from "./WorkflowForm";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

// Lista di workflow ad accordion: ogni riga espande/collassa indipendentemente (stato locale
// di presentazione, stesso pattern DIY usato da EntryCard/RecoveryTripwireForm - niente MUI
// Accordion in questo repo). Sfondo annidato più scuro della card (#0d0f11) per far leggere
// visivamente ogni riga come un layer distinto, coerente con ScheduleGrid/CommandView.
export interface WorkflowAccordionListProps {
  readonly workflows: readonly Workflow[];
  readonly editing: boolean;
  readonly schema: readonly CommandSchema[];
  readonly onChange: (next: Workflow) => void;
  readonly onCreate?: () => void;
  // Nome di un workflow da espandere automaticamente (es. appena creato) - vedi useEffect sotto
  readonly focusName?: string;
}

export function WorkflowAccordionList({
  workflows,
  editing,
  schema,
  onChange,
  onCreate,
  focusName,
}: WorkflowAccordionListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (focusName) setExpanded((prev) => new Set(prev).add(focusName));
  }, [focusName]);

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography
          color="textSecondary"
          sx={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
        >
          {workflows.length} workflow definiti
        </Typography>
        {editing && onCreate && (
          <IconButton size="small" onClick={onCreate} title="New workflow">
            <Add fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {workflows.map((workflow) => (
        <Box
          key={workflow.name}
          sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}
        >
          <Stack
            direction="row"
            onClick={() => toggle(workflow.name)}
            sx={{ gap: 1.25, alignItems: "center", px: 1.5, py: 1, cursor: "pointer" }}
          >
            <Bolt sx={{ fontSize: 13, color: "primary.main" }} />
            <Typography sx={{ ...mono, fontSize: 12, fontWeight: 600, flex: 1 }}>{workflow.name}</Typography>
            <Chip
              label={`${workflow.commands.length} steps`}
              size="small"
              sx={{ ...mono, fontSize: 10, height: 18, borderRadius: "4px" }}
            />
            {expanded.has(workflow.name) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </Stack>

          {expanded.has(workflow.name) && (
            <Box sx={{ bgcolor: "#0d0f11", borderTop: "1px solid", borderColor: "divider", p: 1.5 }}>
              {editing ? (
                <WorkflowForm value={workflow} onChange={onChange} schema={schema} />
              ) : workflow.commands.length === 0 ? (
                <Typography variant="caption" color="textSecondary">
                  Nessuno step
                </Typography>
              ) : (
                <Stack sx={{ gap: 0.75, pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
                  {workflow.commands.map((command, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Command non ha id, sola lettura
                    <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                      <Typography sx={{ ...mono, fontSize: 9, color: "text.disabled", width: 14, textAlign: "right" }}>
                        {index + 1}
                      </Typography>
                      <CommandView value={command} schema={schema} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </Box>
      ))}
    </Stack>
  );
}
