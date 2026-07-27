import {
  Alert,
  Box,
  Button,
  Checkbox,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type { ControlUnit, Device, DeviceStatus, VideoCaptureDevice } from "@supervisor/core/adapters/suitest";
import { useEffect, useState } from "react";

// -------------------------------------------------------------------------------------
// Form di debug: serve solo a smanettare a runtime con i dati del mock server (apps/mocks)
// per vedere i predicati di tracking (apps/service/src/tracking) cambiare in tempo reale.
// -------------------------------------------------------------------------------------

const BASE = "/api/mocks";

interface MockState {
  readonly devices: readonly Device[];
  readonly videoCaptureDevices: readonly VideoCaptureDevice[];
  readonly controlUnits: readonly ControlUnit[];
}

const DEVICE_STATUSES: readonly DeviceStatus[] = [
  "CONTROLLABLE",
  "OFF",
  "OFFLINE",
  "READY",
  "API_CONTROLLED",
  "CANDYBOX_UPDATE",
  "CLEANUP",
  "INTERACTIVE_MODE",
  "MAINTENANCE",
  "MANUAL_RUN",
  "POWER_ON",
  "RESTARTING",
  "SHUTDOWN",
  "SUITEST_DRIVE_UPDATE",
  "TESTING",
  "BLASTER_ERROR",
  "CANDYBOX_OFFLINE",
  "CANNOT_TURN_ON",
  "DISABLED",
  "DRIVER_FAILURE",
  "DRIVER_INIT_FAILURE",
  "INTERNAL_FAILURE",
  "NOT_CONFIGURED",
  "SUITESTDRIVE_OFFLINE",
  "SUITESTDRIVE_SERVICE_OFFLINE",
];

const fetchState = (): Promise<MockState> =>
  fetch(`${BASE}/_admin/state`).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  });

const putJson = (path: string, body: unknown): Promise<void> =>
  fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(() => undefined);

export function MockDataForm() {
  const [state, setState] = useState<MockState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    fetchState()
      .then((s) => {
        setState(s);
        setError(null);
      })
      .catch((e: unknown) => setError(String(e)));
  };

  useEffect(refresh, []);

  const applyVcd = (id: string, patch: Partial<VideoCaptureDevice>) =>
    putJson(`/_admin/video-capture-devices/${id}`, patch).then(refresh);
  const applyCu = (id: string, patch: Partial<ControlUnit>) =>
    putJson(`/_admin/control-units/${id}`, patch).then(refresh);
  const applyDevice = (id: string, patch: { status?: DeviceStatus; inUseBy?: { email: string } | null }) =>
    putJson(`/_admin/devices/${id}`, patch).then(refresh);
  const reset = () => fetch(`${BASE}/_admin/reset`, { method: "POST" }).then(refresh);

  if (error) {
    return (
      <Alert severity="error">
        Mock server unreachable ({error}). È in esecuzione <code>bun mock-services:start</code> su :3002?
      </Alert>
    );
  }

  if (!state) return <Typography color="text.secondary">Loading…</Typography>;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Mock data (debug)
      </Typography>
      <Button variant="outlined" onClick={reset} sx={{ mb: 3 }}>
        Reset all to seed
      </Button>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Video Capture Devices
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>id</TableCell>
              <TableCell>name</TableCell>
              <TableCell>online</TableCell>
              <TableCell>recording</TableCell>
              <TableCell>streaming</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.videoCaptureDevices.map((vcd) => (
              <TableRow key={vcd.id}>
                <TableCell>{vcd.id}</TableCell>
                <TableCell>{vcd.customName ?? vcd.name}</TableCell>
                <TableCell>
                  <Checkbox checked={vcd.online} onChange={(e) => applyVcd(vcd.id, { online: e.target.checked })} />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={vcd.recordingActive}
                    onChange={(e) => applyVcd(vcd.id, { recordingActive: e.target.checked })}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={vcd.streamActive}
                    onChange={(e) => applyVcd(vcd.id, { streamActive: e.target.checked })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Control Units
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>id</TableCell>
              <TableCell>name</TableCell>
              <TableCell>online</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.controlUnits.map((cu) => (
              <TableRow key={cu.id}>
                <TableCell>{cu.id}</TableCell>
                <TableCell>{cu.name}</TableCell>
                <TableCell>
                  <Checkbox checked={cu.online} onChange={(e) => applyCu(cu.id, { online: e.target.checked })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Devices (TV)
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>id</TableCell>
              <TableCell>name</TableCell>
              <TableCell>status</TableCell>
              <TableCell>in use</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {state.devices.map((d) => (
              <TableRow key={d.deviceId}>
                <TableCell>{d.deviceId}</TableCell>
                <TableCell>{d.customName}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={d.status}
                    onChange={(e: SelectChangeEvent) =>
                      applyDevice(d.deviceId, { status: e.target.value as DeviceStatus })
                    }
                    sx={{ minWidth: 200 }}
                  >
                    {DEVICE_STATUSES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={d.inUseBy != null}
                    onChange={(e) =>
                      applyDevice(d.deviceId, { inUseBy: e.target.checked ? { email: "debug@local" } : null })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
