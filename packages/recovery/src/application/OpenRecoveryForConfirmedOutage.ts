// Il custode di INV-1: nessun aggregato vede i propri fratelli, quindi "una sola sessione attiva
// per device coinvolto" la fa rispettare qui, con una domanda al repository — non un `if` sparso.
// La stessa domanda risponde anche a INV-9: dopo una resa non si riapre nulla sugli stessi device
// finché il cooldown non è passato, o un device rotto verrebbe riavviato e notificato a ogni ciclo.
// Quando un bersaglio cluster assorbe device che avevano già una sessione, quelle sessioni vengono
// abortite con `Superseded` **prima** di aprire la nuova: una sessione e un incidente, mai tre.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as AbortReason from "../domain/AbortReason";
import type { RecoveryEvent } from "../domain/RecoveryEvent";
import * as RecoverySession from "../domain/RecoverySession";
import * as Transitions from "../domain/RecoverySession/transitions";
import type { RecoverySessionId } from "../domain/RecoverySessionId";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import * as Ids from "../ports/IdsPort";
import type { Blocking } from "../ports/RecoverySessionRepository";
import * as Sessions from "../ports/RecoverySessionRepository";
import * as Supervision from "../ports/SupervisionPort";

export type Env = Supervision.SupervisionEnv & Sessions.RecoverySessionRepositoryEnv & Ids.IdsEnv;

export type Outcome =
  | { readonly _tag: "Opened"; readonly session: RecoverySession.RecoverySession }
  | { readonly _tag: "AlreadyActive"; readonly sessionId: RecoverySessionId }
  | { readonly _tag: "Blocked"; readonly until: Instant }
  | {
      readonly _tag: "Superseded";
      readonly session: RecoverySession.RecoverySession;
      readonly superseded: ReadonlyArray<RecoverySessionId>;
    }
  // Il kind non ha profilo: sorvegliato ma non curato (NF-1). Non è una lacuna, è il meccanismo.
  | { readonly _tag: "NoProfile" }
  // Il device è in mano a un operatore: non si scavalca (FATTO-15), e non si riapre a raffica una
  // sessione che verrebbe abortita al primo tick (INV-9).
  | { readonly _tag: "NotSupervisable" };

export type Result = { readonly outcome: Outcome; readonly events: ReadonlyArray<RecoveryEvent> };

const coolingDown = (blockings: ReadonlyArray<Blocking>): O.Option<Instant> =>
  pipe(
    blockings,
    RA.filterMap((blocking) => (blocking._tag === "CoolingDown" ? O.some(blocking.until) : O.none)),
    RA.reduce(O.none as O.Option<Instant>, (latest, until) =>
      O.isNone(latest) ? O.some(until) : O.some(Instants.latest(latest.value, until)),
    ),
  );

export const execute = (
  target: RecoveryTarget.RecoveryTarget,
  outageSince: Instant,
  now: Instant,
): RTE.ReaderTaskEither<Env, never, Result> => {
  const members = [...RecoveryTarget.members(target)];
  const done = (outcome: Outcome, events: ReadonlyArray<RecoveryEvent> = []): Result => ({ outcome, events });

  return pipe(
    RTE.Do,
    RTE.apSW("profile", Supervision.profileFor(target)),
    RTE.apSW("ctx", Supervision.contextFor(target)),
    RTE.apSW("blockings", Sessions.findBlockingFor(members, now)),
    RTE.flatMap(({ profile, ctx, blockings }) => {
      if (O.isNone(profile)) return RTE.right<Env, never, Result>(done({ _tag: "NoProfile" }));
      if (ctx.custody._tag !== "Supervisor") return RTE.right<Env, never, Result>(done({ _tag: "NotSupervisable" }));

      const cooldown = coolingDown(blockings);
      if (O.isSome(cooldown)) return RTE.right<Env, never, Result>(done({ _tag: "Blocked", until: cooldown.value }));

      const active = blockings.flatMap((blocking) => (blocking._tag === "ActiveSession" ? [blocking.session] : []));
      // Una sessione sullo stesso bersaglio, o un bersaglio che ci contiene: in entrambi i casi
      // qualcuno se ne sta già occupando.
      const covering = active.find(
        (session) =>
          RecoveryTarget.key(session.target) === RecoveryTarget.key(target) ||
          members.every((device) => RecoveryTarget.involves(session.target, device)),
      );
      if (covering !== undefined)
        return RTE.right<Env, never, Result>(done({ _tag: "AlreadyActive", sessionId: covering.id }));

      return pipe(
        Ids.newSessionId,
        RTE.flatMap((id) => {
          const opened = RecoverySession.open(id, target, profile.value, outageSince, now);
          const absorbed = active.map((session) => Transitions.abort(session, AbortReason.superseded(id), now));
          return pipe(
            RTE.traverseArray((decision: (typeof absorbed)[number]) => Sessions.save(decision.state))(absorbed),
            RTE.flatMap(() => Sessions.save(opened.state)),
            RTE.map(() =>
              absorbed.length === 0
                ? done({ _tag: "Opened", session: opened.state }, opened.events)
                : done(
                    {
                      _tag: "Superseded",
                      session: opened.state,
                      superseded: absorbed.map((decision) => decision.state.id),
                    },
                    [...absorbed.flatMap((decision) => decision.events), ...opened.events],
                  ),
            ),
          );
        }),
      );
    }),
  );
};
