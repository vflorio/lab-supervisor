import Editor from "@monaco-editor/react";
import { Box, Typography } from "@mui/material";
import { useState } from "react";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";
import { ActivationScheduleCard } from "./components/ActivationScheduleCard";
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        Settings
      </Typography>

      <ActivationScheduleCard config={config} onSaved={setConfig} />
      <WorkflowsCard config={config} onSaved={setConfig} />
      <RecoveryCard config={config} onSaved={setConfig} />

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
        <Editor
          height="calc(100vh - 780px)"
          language="json"
          theme="vs-dark"
          value={JSON.stringify(config, null, 2)}
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
        />
      </Box>
    </Box>
  );
}
