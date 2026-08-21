// Identificatori prevedibili: uno scenario che si rompe perché è cambiato un UUID non sta
// verificando il modello.

import * as RecoverySessionId from "../domain/RecoverySessionId";
import type { IdsPort } from "../ports/IdsPort";

export const make = (prefix = "s"): IdsPort => {
  let counter = 0;
  return {
    newSessionId: () => {
      counter += 1;
      return RecoverySessionId.of(`${prefix}-${counter}`);
    },
  };
};
