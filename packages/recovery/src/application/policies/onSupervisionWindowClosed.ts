// La finestra si è chiusa: le sessioni attive sui device che essa autorizzava si fermano subito
// (FATTO-14, INV-3). Il tick lo farebbe comunque — la finestra è live e ogni tick la rilegge — ma
// aspettare il prossimo battito significherebbe lasciare in volo un comando che nessuno voleva più.
// Riceve i device interessati perché è chi compone il sistema a sapere a quali kind quella finestra
// appartenga: il modello non ha un elenco di "tutte le sessioni".

import type { Instant } from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as AbortReason from "../../domain/AbortReason";
import type { RecoveryEvent } from "../../domain/RecoveryEvent";
import * as RecoverySession from "../../domain/RecoverySession";
import * as Sessions from "../../ports/RecoverySessionRepository";

export type Env = Sessions.RecoverySessionRepositoryEnv;

export const execute = (
  devices: ReadonlyArray<DeviceId>,
  now: Instant,
): RTE.ReaderTaskEither<Env, never, ReadonlyArray<RecoveryEvent>> =>
  pipe(
    Sessions.activeInvolving(devices),
    RTE.flatMap((sessions) => {
      const decisions = sessions.map((session) =>
        RecoverySession.decide(session, { _tag: "Abort", reason: AbortReason.outOfWindow, now }),
      );
      return pipe(
        RTE.traverseArray((decision: (typeof decisions)[number]) => Sessions.save(decision.state))(decisions),
        RTE.map(() => decisions.flatMap((decision) => [...decision.events])),
      );
    }),
  );
