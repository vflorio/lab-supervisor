import { AccountTree } from "@mui/icons-material";
import { Alert, Paper } from "@mui/material";
import { COMMAND_SCHEMA, WorkflowJsonCodec } from "@supervisor/core/workflow/codec";
import type { Workflow } from "@supervisor/core/workflow/workflow";
import { DomainCardHeader } from "@supervisor/ui/misc/DomainCardHeader";
import { JsonView } from "@supervisor/ui/misc/JsonView";
import { WorkflowList } from "@supervisor/ui/workflow";
import { useMemo, useState } from "react";
import { useFacts } from "../../../hooks/useFacts";
import { trpc } from "../../../trpc/client";
import type { Config } from "../Settings";
import { EditActions } from "./EditActions";

export function WorkflowsCard({ config, onSaved }: { config: Config; onSaved: (next: Config) => void }) {
  // Per il comando awaitPredicate: gli stessi nomi offerti ai tripwire (vedi RecoveryCard)
  const { table } = useFacts();

  const factOptions = useMemo(
    () => Array.from(table.values()).map(({ domain, entityId, name }) => ({ domain, entityId, name })),
    [table],
  );

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<readonly Workflow[]>(config.workflows);
  const [focusName, setFocusName] = useState<string | undefined>(undefined);
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workflows = editing ? draft : config.workflows;

  const updateWorkflow = (next: Workflow) => setDraft((prev) => prev.map((w) => (w.name === next.name ? next : w)));

  const createWorkflow = () => {
    if (!editing) {
      setDraft(config.workflows);
      setEditing(true);
    }
    const base = editing ? draft : config.workflows;
    const name = `workflow_${base.length + 1}`;
    setDraft([...base, { name, commands: [] }]);
    setFocusName(name);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await trpc.settings.updateWorkflows.mutate(draft.map(WorkflowJsonCodec.encode)));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <DomainCardHeader
        icon={<AccountTree sx={{ fontSize: 16 }} />}
        title="Workflows"
        subtitle="Sequenze di azioni lanciabili dalle pipeline"
        showJson={showJson}
        onToggleJson={() => setShowJson((v) => !v)}
        actions={
          !showJson && (
            <EditActions
              editing={editing}
              saving={saving}
              onStartEdit={() => {
                setDraft(config.workflows);
                setEditing(true);
              }}
              onCancel={() => setEditing(false)}
              onSave={save}
            />
          )
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {showJson ? (
        <JsonView data={config.workflows} />
      ) : (
        <WorkflowList
          workflows={workflows}
          editing={editing}
          schema={COMMAND_SCHEMA}
          factOptions={factOptions}
          onChange={updateWorkflow}
          onCreate={createWorkflow}
          focusName={focusName}
        />
      )}
    </Paper>
  );
}
