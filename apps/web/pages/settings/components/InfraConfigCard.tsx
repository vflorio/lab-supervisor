import { Dns } from "@mui/icons-material";
import {
  Alert,
  Box,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import type { Infra } from "@supervisor/core/config";
import { LogLevel } from "@supervisor/core/logger/logger";
import { POLICY_STEP_SCHEMA } from "@supervisor/core/retry/codec";
import { DurationForm, DurationView } from "@supervisor/ui/duration";
import { DomainCardHeader } from "@supervisor/ui/misc/DomainCardHeader";
import { FieldLabel } from "@supervisor/ui/misc/FieldLabel";
import { JsonView } from "@supervisor/ui/misc/JsonView";
import { NumberField } from "@supervisor/ui/misc/number-field/index";
import { RetryPolicyForm, RetryPolicyView } from "@supervisor/ui/retry-policy";
import { useState } from "react";
import { trpc } from "../../../trpc/client";
import type { Config } from "../Settings";
import { EditActions } from "./EditActions";
import { RestartAdbServerButton } from "./RestartAdbServerButton";

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;
const LOG_LEVELS = Object.keys(LogLevel.keys) as readonly LogLevel[];
const TRACKING_DOMAINS = ["adb", "suitestCamera", "suitestControlUnit", "suitestDevice"] as const;

const toInfra = (config: Config): Infra => ({
  suitest: { baseUrl: config.suitest.baseUrl },
  slack: { active: config.slack.active },
  trpc: config.trpc,
  log: config.log,
  adb: config.adb,
  tracking: config.tracking,
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        color="textSecondary"
        sx={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}
      >
        {label}
      </Typography>
      <Typography sx={{ ...mono, fontSize: 13 }}>{children}</Typography>
    </Box>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 11, fontWeight: 600, mb: 1 }} color="textSecondary">
        {title}
      </Typography>
      <Stack direction="row" sx={{ gap: 3, flexWrap: "wrap", alignItems: "flex-end" }}>
        {children}
      </Stack>
    </Box>
  );
}

// Infra config: editabile e persistita su file via `setConfig`; credentials never shown
export function InfraConfigCard({ config, onSaved }: { config: Config; onSaved: (next: Config) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Infra>(toInfra(config));
  const [showJson, setShowJson] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const infra = editing ? draft : toInfra(config);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await trpc.settings.setConfig.mutate(draft);
    if (result.ok) {
      onSaved(result.data);
      setEditing(false);
    } else {
      setError(result.error.message);
    }
    setSaving(false);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <DomainCardHeader
        icon={<Dns sx={{ fontSize: 16 }} />}
        title="Infrastructure"
        subtitle="Configurazione di infrastruttura e integrazioni esterne"
        showJson={showJson}
        onToggleJson={() => setShowJson((v) => !v)}
        actions={
          !showJson && (
            <EditActions
              editing={editing}
              saving={saving}
              onStartEdit={() => {
                setDraft(toInfra(config));
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
        <JsonView data={infra} />
      ) : (
        <Stack sx={{ gap: 2 }}>
          <Group title="Suitest">
            {editing ? (
              <FieldLabel label="baseUrl" width={260}>
                <TextField
                  size="small"
                  fullWidth
                  value={draft.suitest.baseUrl}
                  onChange={(e) => setDraft({ ...draft, suitest: { baseUrl: e.target.value } })}
                />
              </FieldLabel>
            ) : (
              <Field label="baseUrl">{infra.suitest.baseUrl}</Field>
            )}
          </Group>
          <Group title="Slack">
            {editing ? (
              <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                <Typography sx={{ ...mono, fontSize: 11, color: "textSecondary" }}>active</Typography>
                <Switch
                  size="small"
                  checked={draft.slack.active}
                  onChange={(e) => setDraft({ ...draft, slack: { active: e.target.checked } })}
                />
              </Stack>
            ) : (
              <Field label="active">{String(infra.slack.active)}</Field>
            )}
          </Group>
          <Group title="tRPC">
            {editing ? (
              <>
                <FieldLabel label="hostname" width={160}>
                  <TextField
                    size="small"
                    fullWidth
                    value={draft.trpc.hostname}
                    onChange={(e) => setDraft({ ...draft, trpc: { ...draft.trpc, hostname: e.target.value } })}
                  />
                </FieldLabel>
                <NumberField
                  label="port"
                  value={draft.trpc.port}
                  onChange={(next) => setDraft({ ...draft, trpc: { ...draft.trpc, port: next } })}
                  width={100}
                />
              </>
            ) : (
              <>
                <Field label="hostname">{infra.trpc.hostname}</Field>
                <Field label="port">{infra.trpc.port}</Field>
              </>
            )}
          </Group>
          <Group title="Logging">
            {editing ? (
              <>
                <Select
                  size="small"
                  value={draft.log.level}
                  onChange={(e: SelectChangeEvent) =>
                    setDraft({ ...draft, log: { ...draft.log, level: e.target.value as typeof draft.log.level } })
                  }
                  sx={{ minWidth: 110 }}
                >
                  {LOG_LEVELS.map((level) => (
                    <MenuItem key={level} value={level}>
                      {level}
                    </MenuItem>
                  ))}
                </Select>
                <FieldLabel label="path" width={220}>
                  <TextField
                    size="small"
                    fullWidth
                    value={draft.log.path ?? ""}
                    onChange={(e) => setDraft({ ...draft, log: { ...draft.log, path: e.target.value } })}
                  />
                </FieldLabel>
                <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                  <Typography sx={{ ...mono, fontSize: 11, color: "textSecondary" }}>network</Typography>
                  <Switch
                    size="small"
                    checked={draft.log.network ?? false}
                    onChange={(e) => setDraft({ ...draft, log: { ...draft.log, network: e.target.checked } })}
                  />
                </Stack>
              </>
            ) : (
              <>
                <Field label="level">{infra.log.level}</Field>
                {infra.log.path && <Field label="path">{infra.log.path}</Field>}
                <Field label="network">{String(infra.log.network ?? false)}</Field>
              </>
            )}
          </Group>
          <Group title="ADB">
            {editing ? (
              <>
                <NumberField
                  label="port"
                  value={draft.adb.port}
                  onChange={(next) =>
                    setDraft({ ...draft, adb: { ...draft.adb, port: next as typeof draft.adb.port } })
                  }
                  width={100}
                />
                <DurationForm
                  label="waitForDeviceTimeout"
                  value={draft.adb.waitForDeviceTimeout}
                  onChange={(next) => setDraft({ ...draft, adb: { ...draft.adb, waitForDeviceTimeout: next } })}
                />
              </>
            ) : (
              <>
                <Field label="port">{infra.adb.port}</Field>
                <Field label="waitForDeviceTimeout">
                  <DurationView value={infra.adb.waitForDeviceTimeout} />
                </Field>
                <RestartAdbServerButton />
              </>
            )}
          </Group>
          <Group title="Tracking">
            {TRACKING_DOMAINS.map((domain) => (
              <Box key={domain}>
                <Typography sx={{ ...mono, fontSize: 10, color: "textSecondary", mb: 0.5 }}>{domain}</Typography>
                {editing ? (
                  <RetryPolicyForm
                    value={draft.tracking[domain].policy}
                    schema={POLICY_STEP_SCHEMA}
                    onChange={(policy) =>
                      setDraft({
                        ...draft,
                        tracking: { ...draft.tracking, [domain]: { policy } },
                      })
                    }
                  />
                ) : (
                  <RetryPolicyView value={infra.tracking[domain].policy} />
                )}
              </Box>
            ))}
          </Group>
        </Stack>
      )}
    </Paper>
  );
}
