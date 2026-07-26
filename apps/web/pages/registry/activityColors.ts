import type { ActivityColor } from "../../components/ActivityStatus";

// -------------------------------------------------------------------------------------
// Mapping status -> colore per ciascuna ActivitySource -
// un solo posto per riga così i tre indicatori (recovery/workflow/adb) restano coerenti tra
// CameraRow/TvRow/ControlUnitCard invece di reinventare la palette in ciascuna row.
// -------------------------------------------------------------------------------------

// Stati del tripwire di recovery (source "recovery")
export const recoveryColorFor = (status: string | undefined): ActivityColor => {
  switch (status) {
    case "healthy":
      return "success";
    case "pending":
      return "warning";
    case "fired":
      return "error";
    default:
      return "disabled";
  }
};

// Esito della pipeline innescata da un tripwire "fired" (source "workflow")
export const workflowColorFor = (status: string | undefined): ActivityColor => {
  switch (status) {
    case "running":
      return "info";
    case "succeeded":
      return "success";
    case "exhausted":
      return "error";
    default:
      return "disabled";
  }
};

// Stato della FSM android-bridge di una camera (source "adb") - "disconnected" porta anche il reason
// tra parentesi (es. "disconnected (timeout)"), da cui lo startsWith invece di un match esatto.
export const adbBridgeColorFor = (status: string | undefined): ActivityColor => {
  if (status === "connected") return "success";
  if (status === "connecting") return "warning";
  if (status?.startsWith("disconnected")) return "error";
  return "disabled";
};
