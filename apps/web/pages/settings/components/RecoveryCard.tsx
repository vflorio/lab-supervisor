import { Security } from "@mui/icons-material";
import { Alert, Paper } from "@mui/material";
import { NOTIFY_TARGET_SCHEMA } from "@supervisor/core/notify/codec";
import { RecoveryPolicyCodec } from "@supervisor/core/recovery/codec";
import type { RecoveryPolicy } from "@supervisor/core/recovery/model";
import { POLICY_STEP_SCHEMA } from "@supervisor/core/retry/retry";
import { DomainCardHeader } from "@supervisor/ui/misc/DomainCardHeader";
import { JsonView } from "@supervisor/ui/misc/JsonView";
import { RecoveryPolicyList } from "@supervisor/ui/recovery";
import { useMemo, useState } from "react";
import { usePredicates } from "../../../hooks/usePredicates";
import { trpc } from "../../../trpc/client";
import type { Config } from "../Settings";
import { EditActions } from "./EditActions";

export function RecoveryCard({ config, onSaved }: { config: Config; onSaved: (next: Config) => void }) {
  const { table } = usePredicates();

  const predicateOptions = useMemo(
    () =>
      Array.from(table.values()).map((entry) => ({
        domain: entry.domain,
        entityId: entry.entityId, //FIXME: ???
        name: entry.name,
      })),
    [table],
  );

  const workflowNames = useMemo(() => config.workflows.map((w) => w.name), [config.workflows]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<readonly RecoveryPolicy[]>(config.recovery ?? []);
  const [focusLabel, setFocusLabel] = useState<string | undefined>(undefined);
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const policies = editing ? draft : (config.recovery ?? []);

  const updatePolicy = (next: RecoveryPolicy) =>
    setDraft((prev) => prev.map((p) => (p.label === next.label ? next : p)));

  const createPolicy = () => {
    if (!editing) {
      setDraft(config.recovery ?? []);
      setEditing(true);
    }
    const base = editing ? draft : (config.recovery ?? []);
    const label = `policy_${base.length + 1}`;
    setDraft([...base, { label, domain: "", tripwires: [] }]);
    setFocusLabel(label);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // Cast: variance readonly (RecoveryPolicy) vs mutable (TypeOf<RecoveryPolicyCodec>), stessa
      // forma strutturale - vedi il cast analogo lato service in trpc-services.ts#updateRecovery.
      onSaved(
        await trpc.settings.updateRecovery.mutate(draft.map((policy) => RecoveryPolicyCodec.encode(policy as never))),
      );
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
        icon={<Security sx={{ fontSize: 16 }} />}
        title="Recovery"
        subtitle="Monitoraggio e ripristino automatico dei dispositivi"
        showJson={showJson}
        onToggleJson={() => setShowJson((v) => !v)}
        actions={
          !showJson && (
            <EditActions
              editing={editing}
              saving={saving}
              onStartEdit={() => {
                setDraft(config.recovery ?? []);
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
        <JsonView data={config.recovery ?? []} />
      ) : (
        <RecoveryPolicyList
          policies={policies}
          editing={editing}
          retrySchema={POLICY_STEP_SCHEMA}
          notifyTargetSchema={NOTIFY_TARGET_SCHEMA}
          workflowNames={workflowNames}
          predicateOptions={predicateOptions}
          onChange={updatePolicy}
          onCreate={createPolicy}
          focusLabel={focusLabel}
        />
      )}
    </Paper>
  );
}
