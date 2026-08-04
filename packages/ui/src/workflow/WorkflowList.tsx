import { Add, Bolt } from "@mui/icons-material";
import { Chip, IconButton, Stack, Typography } from "@mui/material";
import type { CommandSchema } from "@supervisor/core/workflow/codec";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { useEffect, useState } from "react";
import type { FactOption } from "../fact/FactRefPicker";
import { DomainCardAccordion } from "../misc/DomainCardAccordion";
import { CommandView } from "./CommandView";
import { WorkflowForm } from "./WorkflowForm";

export interface WorkflowListProps {
  readonly workflows: readonly Workflow[];
  readonly editing: boolean;
  readonly schema: readonly CommandSchema[];
  readonly onChange: (next: Workflow) => void;
  readonly onCreate?: () => void;
  readonly focusName?: string;
  readonly factOptions?: readonly FactOption[];
}

export function WorkflowList({
  workflows,
  editing,
  schema,
  onChange,
  onCreate,
  focusName,
  factOptions = [],
}: WorkflowListProps) {
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
        <Typography variant="monoEyebrow" color="textSecondary">
          {workflows.length} workflow definiti
        </Typography>
        {editing && onCreate && (
          <IconButton size="small" onClick={onCreate} title="New workflow">
            <Add fontSize="small" />
          </IconButton>
        )}
      </Stack>

      {workflows.map((workflow) => (
        <DomainCardAccordion
          key={workflow.name}
          icon={<Bolt sx={{ fontSize: 13, color: "primary.main" }} />}
          title={
            <Typography variant="monoTitle" sx={{ fontWeight: 600 }}>
              {workflow.name}
            </Typography>
          }
          trailing={<Chip label={`${workflow.commands.length} steps`} size="small" sx={{ height: 18 }} />}
          expanded={expanded.has(workflow.name)}
          onToggle={() => toggle(workflow.name)}
        >
          {editing ? (
            <WorkflowForm value={workflow} onChange={onChange} schema={schema} factOptions={factOptions} />
          ) : workflow.commands.length === 0 ? (
            <Typography variant="caption" color="textSecondary">
              Nessuno step
            </Typography>
          ) : (
            <Stack sx={{ gap: 0.75, pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
              {workflow.commands.map((command, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Command non ha id, sola lettura
                <Stack key={index} direction="row" sx={{ gap: 1, alignItems: "center" }}>
                  <Typography variant="monoLabel" sx={{ color: "text.disabled", width: 14, textAlign: "right" }}>
                    {index + 1}
                  </Typography>
                  <CommandView value={command} schema={schema} />
                </Stack>
              ))}
            </Stack>
          )}
        </DomainCardAccordion>
      ))}
    </Stack>
  );
}
