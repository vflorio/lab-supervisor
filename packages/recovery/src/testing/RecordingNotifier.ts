// Raccoglie gli incidenti pubblicati invece di mandarli da qualche parte. Uno scenario ci legge
// quanti ne sono stati alzati (mai più di uno per sessione) e cosa contiene il dossier.

import * as TE from "fp-ts/TaskEither";
import type { Incident } from "../domain/Incident";
import { type NotificationPort, type NotifyFailed, notifyFailed } from "../ports/NotificationPort";

export interface RecordingNotifier extends NotificationPort {
  readonly published: () => ReadonlyArray<Incident>;
  readonly fail: (detail: string) => void;
}

export const make = (): RecordingNotifier => {
  const incidents: Incident[] = [];
  let failure: NotifyFailed | undefined;

  return {
    published: () => [...incidents],
    fail: (detail) => {
      failure = notifyFailed(detail);
    },
    publish: (incident) =>
      failure !== undefined
        ? TE.left(failure)
        : TE.fromIO(() => {
            incidents.push(incident);
          }),
  };
};
