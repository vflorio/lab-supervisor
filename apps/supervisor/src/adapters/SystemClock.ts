// L'orologio vero. È l'unico posto del servizio in cui si legge `Date.now()`: tutto il resto —
// dominio, casi d'uso, policy — riceve l'istante per valore (M-1, A-2).
// Da non confondere con il ticker: quello decide *quando* si guarda, questo dice *che ora è*.

import type { Clock } from "@lab/kernel/Clock";
import * as Instant from "@lab/kernel/Instant";

export const make = (): Clock => ({ now: () => Instant.fromEpochMillis(Date.now()) });
