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
