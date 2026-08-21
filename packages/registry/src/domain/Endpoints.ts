// Dove un device si raggiunge. È l'unico punto del modello in cui un indirizzo è lecito, ed è
// un dato **opaco**: il dominio lo passa all'adapter e non lo interpreta mai (se lo facesse,
// saprebbe di adb, cioè sarebbe morto — NO-9).
// È un record di endpoint opzionali, non una union (A-Ext-1): una camera ne ha tipicamente due
// insieme, l'adb per comandare e il riferimento Suitest per osservare lo stream (FATTO-9).
// Domani la TV ne avrà tre, e questo file cresce di un campo.

import { type Brand, brand } from "@lab/kernel";
import * as O from "fp-ts/Option";

export type AdbEndpoint = Brand<string, "AdbEndpoint">;

export type SuitestRef = Brand<string, "SuitestRef">;

export const adbEndpoint = (value: string): AdbEndpoint => brand<AdbEndpoint>(value);

export const suitestRef = (value: string): SuitestRef => brand<SuitestRef>(value);

export type Endpoints = {
  readonly adb: O.Option<AdbEndpoint>;
  readonly suitest: O.Option<SuitestRef>;
};

export const empty: Endpoints = { adb: O.none, suitest: O.none };

export const make = (endpoints: Partial<Endpoints>): Endpoints => ({ ...empty, ...endpoints });
