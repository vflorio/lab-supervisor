// Perché una sessione si è fermata **senza** arrendersi. Un abort non è una resa: non alza un
// incidente e non fissa un cooldown, perché in nessuno di questi casi il device è rotto.
// `MaintenanceHold` porta con sé la ragione scritta dall'operatore, così il dossier dice chi ha
// fermato cosa e perché senza che qualcuno debba aprire i log (FATTO-16).

import type { RecoverySessionId } from "./RecoverySessionId";

export type AbortReason =
  | { readonly _tag: "OutOfWindow" }
  | { readonly _tag: "MaintenanceHold"; readonly by: string }
  | { readonly _tag: "CustodyLost" }
  | { readonly _tag: "SelfHealed" }
  | { readonly _tag: "Superseded"; readonly bySessionId: RecoverySessionId }
  | { readonly _tag: "OperatorRequest" };

export const outOfWindow: AbortReason = { _tag: "OutOfWindow" };

export const maintenanceHold = (by: string): AbortReason => ({ _tag: "MaintenanceHold", by });

export const custodyLost: AbortReason = { _tag: "CustodyLost" };

export const selfHealed: AbortReason = { _tag: "SelfHealed" };

export const superseded = (bySessionId: RecoverySessionId): AbortReason => ({ _tag: "Superseded", bySessionId });

export const operatorRequest: AbortReason = { _tag: "OperatorRequest" };
