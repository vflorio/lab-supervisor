import { Schedule } from "@mui/icons-material";
import { Alert, Paper } from "@mui/material";
import type { ActivationSchedule } from "@supervisor/core/activation/schedule";
import { ActivationScheduleForm, ActivationScheduleView } from "@supervisor/ui/activation-schedule";
import { DomainCardHeader } from "@supervisor/ui/DomainCardHeader";
import { JsonView } from "@supervisor/ui/JsonView";
import { useState } from "react";
import { trpc } from "../../../trpc/client";
import type { Config } from "../Settings";
import { EditActions } from "./EditActions";

export function ActivationScheduleCard({ config, onSaved }: { config: Config; onSaved: (next: Config) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ActivationSchedule>(config.activationSchedule);
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await trpc.settings.updateActivationSchedule.mutate(draft));
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
        icon={<Schedule sx={{ fontSize: 16 }} />}
        title="Activation Schedule"
        subtitle="Periodo di attivazione del servizio"
        showJson={showJson}
        onToggleJson={() => setShowJson((v) => !v)}
        actions={
          !showJson && (
            <EditActions
              editing={editing}
              saving={saving}
              onStartEdit={() => {
                setDraft(config.activationSchedule);
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
        <JsonView data={config.activationSchedule} />
      ) : editing ? (
        <ActivationScheduleForm value={draft} onChange={setDraft} />
      ) : (
        <ActivationScheduleView value={config.activationSchedule} />
      )}
    </Paper>
  );
}
