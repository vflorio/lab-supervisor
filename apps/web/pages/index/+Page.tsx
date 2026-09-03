import { Alert, Box } from "@mui/material";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "../index/+data";
import { RegistryBody } from "../registry/Registry";

export default function Page() {
  const { registry, adbDevices, workflows, adbPort } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);

  return (
    <Box sx={{ maxHeight: "calc(100vh - 64px)", overflowY: "auto" }}>
      {match(registry)
        .with({ ok: true }, ({ data }) => (
          <RegistryBody db={data} adbDevices={liveAdbDevices} workflows={workflows} adbPort={adbPort} />
        ))
        .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
        .exhaustive()}
    </Box>
  );
}
