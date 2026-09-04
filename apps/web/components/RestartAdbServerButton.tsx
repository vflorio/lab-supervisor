import { RestartAlt } from "@mui/icons-material";
import { Alert, Button, CircularProgress, Stack } from "@mui/material";
import { useState } from "react";
import { trpc } from "../trpc/client";

// `adb disconnect` (all) + `adb kill-server && adb start-server`
export function RestartAdbServerButton() {
  const [restarting, setRestarting] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restart = async () => {
    setRestarting(true);
    setError(null);
    const result = await trpc.android.restartServer.mutate();
    if (result.ok) {
      setRestarted(true);
      setTimeout(() => setRestarted(false), 2000);
    } else {
      setError(result.error.message);
    }
    setRestarting(false);
  };

  return (
    <Stack sx={{ gap: 1 }}>
      <Button
        size="small"
        variant="outlined"
        color={error ? "error" : "inherit"}
        disabled={restarting}
        startIcon={restarting ? <CircularProgress size={14} /> : <RestartAlt fontSize="small" />}
        onClick={restart}
      >
        {restarting ? "Restarting…" : restarted ? "Restarted" : "Restart ADB server"}
      </Button>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ py: 0 }}>
          {error}
        </Alert>
      )}
    </Stack>
  );
}
