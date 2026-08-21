// Una sola porta, definita per **intento** e non per tecnologia (A-7). Se esistessero un
// `SuitestPort` e un `AdbPort`, il dominio dovrebbe sapere quale usare — cioè saprebbe di adb,
// cioè sarebbe morto. Lo smistamento è un adapter di routing, e smista su `(kind, remedy)`
// perché domani la TV avrà rimedi Suitest **e** rimedi CDP (A-Ext-2).
// `E = never` (A-6): un rimedio rifiutato è un **esito** che la sessione deve poter scrivere nel
// dossier, non un errore. Se finisse nel canale d'errore, la `RetryPolicy` dovrebbe leggerlo da
// un catch. L'adapter traduce tutto in `RemedyOutcome`: se un exit code di adb o un `AxiosError`
// attraversa questa porta, l'ACL ha perso (NO-10).

import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { Remedy } from "../domain/Remedy";
import type { RemedyOutcome } from "../domain/RemedyOutcome";

export interface DeviceControlPort {
  readonly apply: (deviceId: DeviceId, remedy: Remedy) => TE.TaskEither<never, RemedyOutcome>;
}

export interface DeviceControlEnv {
  readonly deviceControl: DeviceControlPort;
}

export const apply =
  (deviceId: DeviceId, remedy: Remedy): ReaderTaskEither<DeviceControlEnv, never, RemedyOutcome> =>
  (env) =>
    env.deviceControl.apply(deviceId, remedy);
