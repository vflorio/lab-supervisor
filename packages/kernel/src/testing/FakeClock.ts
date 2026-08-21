// Orologio pilotato a mano per i test: nessuno scenario deve dipendere dall'orologio di
// sistema (§0). `advance` è ciò che permette di attraversare un grace period di tre minuti
// senza aspettarli.

import type { Clock } from "../Clock";
import type * as Duration from "../Duration";
import * as Instant from "../Instant";

export interface FakeClock extends Clock {
  readonly read: () => Instant.Instant;
  readonly set: (at: Instant.Instant) => void;
  readonly advance: (by: Duration.Duration) => Instant.Instant;
}

export const make = (start: Instant.Instant): FakeClock => {
  let current = start;
  return {
    now: () => current,
    read: () => current,
    set: (at) => {
      current = at;
    },
    advance: (by) => {
      current = Instant.plus(current, by);
      return current;
    },
  };
};
