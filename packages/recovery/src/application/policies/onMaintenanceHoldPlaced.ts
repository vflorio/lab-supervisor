// Un operatore ha preso in mano il device: si aborta, mai il contrario (FATTO-15). Un hold non è
// un guasto, quindi non alza incidenti — e siccome l'abort non fissa cooldown, a impedire la
// riapertura è il controllo di custodia in `OpenRecoveryForConfirmedOutage`, che non apre nulla su
// un device che non è del supervisore.

import type { Instant } from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as AbortReason from "../../domain/AbortReason";
import * as RecoveryTarget from "../../domain/RecoveryTarget";
import * as AbortRecovery from "../AbortRecovery";

export type Env = AbortRecovery.Env;

export const execute = (
  deviceId: DeviceId,
  reason: string,
  now: Instant,
): RTE.ReaderTaskEither<Env, never, AbortRecovery.Output> =>
  AbortRecovery.execute(RecoveryTarget.device(deviceId), AbortReason.maintenanceHold(reason), now);
