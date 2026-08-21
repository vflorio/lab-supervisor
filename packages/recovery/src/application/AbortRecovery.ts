// Fermare il recupero su un bersaglio, per una ragione che viene da fuori: un operatore che
// reclama il device, una finestra che si chiude, una richiesta esplicita. Non è una resa — nessun
// incidente e nessun cooldown — perché in nessuno di questi casi il device è rotto.

import type { Instant } from "@lab/kernel/Instant";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { AbortReason } from "../domain/AbortReason";
import type { RecoveryEvent } from "../domain/RecoveryEvent";
import * as RecoverySession from "../domain/RecoverySession";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import * as Sessions from "../ports/RecoverySessionRepository";

export type Env = Sessions.RecoverySessionRepositoryEnv;

export type Output = {
  readonly aborted: ReadonlyArray<RecoverySession.RecoverySession>;
  readonly events: ReadonlyArray<RecoveryEvent>;
};

export const execute = (
  target: RecoveryTarget.RecoveryTarget,
  reason: AbortReason,
  now: Instant,
): RTE.ReaderTaskEither<Env, never, Output> =>
  pipe(
    Sessions.activeInvolving([...RecoveryTarget.members(target)]),
    RTE.flatMap((sessions) => {
      const decisions = sessions.map((session) => RecoverySession.decide(session, { _tag: "Abort", reason, now }));
      return pipe(
        RTE.traverseArray((decision: (typeof decisions)[number]) => Sessions.save(decision.state))(decisions),
        RTE.map(() => ({
          aborted: decisions.map((decision) => decision.state),
          events: decisions.flatMap((decision) => [...decision.events]),
        })),
      );
    }),
  );
