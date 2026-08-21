// Le sessioni in memoria. `findBlockingFor` è l'unico metodo con della logica, ed è la logica
// che rende INV-1 e INV-9 verificabili: un device è occupato se una sessione attiva lo tocca,
// oppure se ci si è arresi su di lui da meno del cooldown.

import type { Instant } from "@lab/kernel/Instant";
import * as Instants from "@lab/kernel/Instant";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as RecoverySession from "../domain/RecoverySession";
import type { RecoverySessionId } from "../domain/RecoverySessionId";
import * as RecoveryTarget from "../domain/RecoveryTarget";
import type { Blocking, RecoverySessionRepository } from "../ports/RecoverySessionRepository";

export interface InMemoryRecoverySessionRepository extends RecoverySessionRepository {
  readonly all: () => ReadonlyArray<RecoverySession.RecoverySession>;
}

export const make = (seed: ReadonlyArray<RecoverySession.RecoverySession> = []): InMemoryRecoverySessionRepository => {
  const sessions = new Map<RecoverySessionId, RecoverySession.RecoverySession>(
    seed.map((session) => [session.id, session]),
  );
  const all = () => [...sessions.values()];

  const touches = (session: RecoverySession.RecoverySession, devices: ReadonlyArray<DeviceId>) =>
    devices.some((device) => RecoveryTarget.involves(session.target, device));

  return {
    all,
    findBlockingFor: (devices, now) =>
      TE.right(
        all().flatMap((session): ReadonlyArray<Blocking> => {
          if (!touches(session, devices)) return [];
          if (RecoverySession.isActive(session)) return [{ _tag: "ActiveSession", session }];
          return session.phase._tag === "GivenUp" && Instants.isBefore(now, session.phase.retryNotBefore)
            ? [{ _tag: "CoolingDown", session, until: session.phase.retryNotBefore }]
            : [];
        }),
      ),
    activeInvolving: (devices) =>
      TE.right(all().filter((session) => RecoverySession.isActive(session) && touches(session, devices))),
    dueAt: (now: Instant) =>
      TE.right(
        all().filter((session) =>
          pipe(
            RecoverySession.nextDueAt(session),
            O.exists((due) => !Instants.isBefore(now, due)),
          ),
        ),
      ),
    byId: (id) => TE.right(O.fromNullable(sessions.get(id))),
    save: (session) =>
      TE.fromIO(() => {
        sessions.set(session.id, session);
      }),
  };
};
