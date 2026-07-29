import { Settings as SettingsIcon } from "@mui/icons-material";
import { Stack } from "@mui/material";
import { useState } from "react";
import { useData } from "vike-react/useData";
import { Panel } from "../../layout/Panel";
import type { Data } from "./+data";
import { ActivationScheduleCard } from "./components/ActivationScheduleCard";
import { InfraConfigCard } from "./components/InfraConfigCard";
import { RecoveryCard } from "./components/RecoveryCard";
import { WorkflowsCard } from "./components/WorkflowsCard";

export type Config = Data["config"];

// La config viene servita già redatta dal service (vedi ConfigModel.redact) - nessun segreto
// reale arriva mai qui. `activationSchedule`, `workflows` e `recovery` sono editabili: tutte e
// tre le mutation sono in-memory lato service (si perdono al riavvio, vedi
// Trpc.Services["settings"]), il resto della config resta di sola lettura nel JSON viewer sotto.
export function Settings() {
  const { config: initialConfig } = useData<Data>();
  const [config, setConfig] = useState(initialConfig);

  return (
    <Panel title="Settings" icon={<SettingsIcon sx={{ fontSize: 16 }} />}>
      <Stack spacing={2}>
        <ActivationScheduleCard config={config} onSaved={setConfig} />
        <WorkflowsCard config={config} onSaved={setConfig} />
        <RecoveryCard config={config} onSaved={setConfig} />
        <InfraConfigCard config={config} onSaved={setConfig} />
      </Stack>
    </Panel>
  );
}
