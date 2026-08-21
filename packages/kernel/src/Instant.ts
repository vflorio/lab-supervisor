// Un punto sulla linea del tempo, in millisecondi epoch. È un valore, non una lettura
// dell'orologio: il dominio lo riceve sempre dall'esterno (dentro un comando), non lo
// produce mai. Chi legge l'orologio è la porta `Clock`, e sta nell'application layer.

import type * as EqModule from "fp-ts/Eq";
import * as N from "fp-ts/number";
import type * as OrdModule from "fp-ts/Ord";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import { type Brand, brand } from "./Brand";
import * as Duration from "./Duration";

export type Instant = Brand<number, "Instant">;

export const fromEpochMillis = (millis: number): Instant => brand<Instant>(Math.trunc(millis));

export const toEpochMillis = (instant: Instant): number => instant;

export const plus = (instant: Instant, duration: Duration.Duration): Instant =>
  fromEpochMillis(instant + Duration.toMillis(duration));

export const minus = (instant: Instant, duration: Duration.Duration): Instant =>
  fromEpochMillis(instant - Duration.toMillis(duration));

// Distanza non orientata fra due istanti: una `Duration` non è mai negativa, quindi
// l'ordine degli argomenti non cambia il risultato.
export const between = (a: Instant, b: Instant): Duration.Duration => Duration.millis(Math.abs(b - a));

export const isAtOrAfter = (instant: Instant, reference: Instant): boolean => instant >= reference;

export const isAfter = (instant: Instant, reference: Instant): boolean => instant > reference;

export const isBefore = (instant: Instant, reference: Instant): boolean => instant < reference;

export const earliest = (a: Instant, b: Instant): Instant => (a <= b ? a : b);

export const latest = (a: Instant, b: Instant): Instant => (a >= b ? a : b);

export const earliestOf = (instants: ReadonlyNonEmptyArray<Instant>): Instant => instants.reduce(earliest);

// Serve al quorum di FL-3: l'outage di un cluster comincia al più tardo fra gli inizi di
// outage dei figli che lo hanno formato, non al primo che è caduto.
export const latestOf = (instants: ReadonlyNonEmptyArray<Instant>): Instant => instants.reduce(latest);

export const Ord: OrdModule.Ord<Instant> = N.Ord;

export const Eq: EqModule.Eq<Instant> = N.Eq;
