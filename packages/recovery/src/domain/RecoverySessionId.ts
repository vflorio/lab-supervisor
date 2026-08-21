// L'identità di una sessione di recupero. Serve anche fuori dall'aggregato: `Superseded` porta
// l'id della sessione che ha assorbito quella vecchia (INV-1), e l'`Incident` cita la sessione
// che lo ha alzato.

import { type Brand, brand } from "@lab/kernel";
import type * as EqModule from "fp-ts/Eq";
import * as S from "fp-ts/string";

export type RecoverySessionId = Brand<string, "RecoverySessionId">;

export const of = (value: string): RecoverySessionId => brand<RecoverySessionId>(value);

export const value = (id: RecoverySessionId): string => id;

export const Eq: EqModule.Eq<RecoverySessionId> = S.Eq;
