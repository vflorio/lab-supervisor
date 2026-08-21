// `IdsPort` in produzione: un UUID per sessione. Gli identificatori sono I/O — dipendono da un
// generatore di casualità — ed è per questo che il dominio non ne produce (M-8).
// Nei test si monta `SequentialSessionIds`, e uno scenario non si rompe perché è cambiato un UUID.

import * as RecoverySessionId from "@lab/recovery/domain/RecoverySessionId";
import type { IdsPort } from "@lab/recovery/ports/IdsPort";

export const make = (): IdsPort => ({
  newSessionId: () => RecoverySessionId.of(crypto.randomUUID()),
});
