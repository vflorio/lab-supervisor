// Una quantità di tempo, in millisecondi, mai negativa: è ciò che separa due istanti, non un
// punto sulla linea del tempo (quello è `Instant`). Grace period, backoff, assestamenti e
// scadenze del recovery sono tutti `Duration`, e tenerli distinti dagli istanti è ciò che
// impedisce di sommare per sbaglio due date.

import type * as EqModule from "fp-ts/Eq";
import * as N from "fp-ts/number";
import type * as OrdModule from "fp-ts/Ord";
import { type Brand, brand } from "./Brand";

export type Duration = Brand<number, "Duration">;

// I valori negativi vengono azzerati invece di essere rifiutati: una durata negativa non ha
// significato nel dominio, e propagare un `Either` per un caso che non si verifica mai
// costerebbe a ogni chiamante più di quanto valga.
export const millis = (value: number): Duration => brand<Duration>(Math.max(0, Math.trunc(value)));

export const seconds = (value: number): Duration => millis(value * 1_000);

export const minutes = (value: number): Duration => millis(value * 60_000);

export const hours = (value: number): Duration => millis(value * 3_600_000);

export const zero: Duration = millis(0);

export const toMillis = (duration: Duration): number => duration;

export const plus = (a: Duration, b: Duration): Duration => millis(a + b);

export const times = (duration: Duration, factor: number): Duration => millis(duration * factor);

export const min = (a: Duration, b: Duration): Duration => (a <= b ? a : b);

export const max = (a: Duration, b: Duration): Duration => (a >= b ? a : b);

export const Ord: OrdModule.Ord<Duration> = N.Ord;

export const Eq: EqModule.Eq<Duration> = N.Eq;
