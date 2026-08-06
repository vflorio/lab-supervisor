import { Alert, Box } from "@mui/material";
import type { LoopEntry } from "@supervisor/core/task-runner/model";
import { type LoopWidgetProps, ServiceStrip } from "@supervisor/ui/task-runner";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { useAdbDevices } from "../../hooks/useAdbDevices";
import { useLoops } from "../../hooks/useLoops";
import type { Data } from "../index/+data";
import { RegistryBody } from "./Registry";

const toLoopWidgetProps = (entry: LoopEntry): LoopWidgetProps => ({
  id: entry.id,
  label: entry.label,
  state: entry.status,
  iteration: entry.iteration,
  lastTickAt: entry.lastTickAt,
  nextTickAt: entry.nextTickAt,
  delayMs: entry.delayMs,
  policyLabel: entry.policyLabel,
  detail: entry.detail,
});

export function RegistryHeartbeatView() {
  const { registry, adbDevices, workflows } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);
  const loops = useLoops();

  return (
    <Box sx={{ maxHeight: "calc(100vh - 64px)", overflowY: "auto" }}>
      <ServiceStrip connection={loops.status} loops={loops.sorted.map(toLoopWidgetProps)} />
      {match(registry)
        .with({ ok: true }, ({ data }) => <RegistryBody db={data} adbDevices={liveAdbDevices} workflows={workflows} />)
        .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
        .exhaustive()}
    </Box>
  );
}
