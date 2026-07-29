import Editor from "@monaco-editor/react";
import { Box, Typography } from "@mui/material";
import { useData } from "vike-react/useData";
import type { Data } from "./+data";

// Sola lettura: la config viene già servita redatta dal service (vedi ConfigModel.redact) -
// nessun segreto reale arriva mai qui, ma il valore resta comunque non modificabile via UI.
export function Settings() {
  const { config } = useData<Data>();

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        Settings
      </Typography>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
        <Editor
          height="calc(100vh - 180px)"
          language="json"
          theme="vs-dark"
          value={JSON.stringify(config, null, 2)}
          options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }}
        />
      </Box>
    </Box>
  );
}
