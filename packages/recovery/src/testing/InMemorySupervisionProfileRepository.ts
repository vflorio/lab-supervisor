// I profili in memoria, indicizzati per kind. Un kind assente non è un buco di configurazione:
// è "monitorato ma non curato" (NF-1).

import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import type { SupervisionProfile } from "../domain/SupervisionProfile";
import type { SupervisionProfileRepository } from "../ports/SupervisionProfileRepository";

export interface InMemorySupervisionProfileRepository extends SupervisionProfileRepository {
  readonly all: () => ReadonlyArray<SupervisionProfile>;
}

export const make = (seed: ReadonlyArray<SupervisionProfile> = []): InMemorySupervisionProfileRepository => {
  const profiles = new Map<DeviceKind, SupervisionProfile>(seed.map((profile) => [profile.kind, profile]));

  return {
    all: () => [...profiles.values()],
    forKind: (kind) => TE.right(O.fromNullable(profiles.get(kind))),
    save: (profile) =>
      TE.fromIO(() => {
        profiles.set(profile.kind, profile);
      }),
  };
};
