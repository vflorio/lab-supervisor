// L'identità di un device. È published language del registry (A-1): monitoring e recovery la
// usano per parlare degli stessi oggetti fisici, ma nessuno dei due può fabbricarne una che
// l'anagrafica non conosca.

import { type Brand, brand } from "@lab/kernel";
import type * as EqModule from "fp-ts/Eq";
import type * as OrdModule from "fp-ts/Ord";
import * as S from "fp-ts/string";

export type DeviceId = Brand<string, "DeviceId">;

export const of = (value: string): DeviceId => brand<DeviceId>(value);

export const value = (id: DeviceId): string => id;

export const Eq: EqModule.Eq<DeviceId> = S.Eq;

export const Ord: OrdModule.Ord<DeviceId> = S.Ord;
