// Rifiuta al confine i playbook invalidi, e **non tocca le sessioni aperte** (INV-13): cambiare la
// configurazione non deve alterare un recupero in corso, o il dossier racconterebbe una storia che
// non è successa. Le regole nuove valgono per le sessioni che si apriranno da adesso.

import * as Capability from "@lab/registry/domain/Capability";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { InvalidPlaybookForKind } from "../domain/errors";
import * as SupervisionProfile from "../domain/SupervisionProfile";
import * as Profiles from "../ports/SupervisionProfileRepository";

export type Env = Profiles.SupervisionProfileRepositoryEnv;

export const execute = (
  draft: SupervisionProfile.SupervisionProfile,
): RTE.ReaderTaskEither<Env, InvalidPlaybookForKind, SupervisionProfile.SupervisionProfile> =>
  pipe(
    RTE.fromEither(SupervisionProfile.make(draft, Capability.capabilitiesOfKind(draft.kind))),
    RTE.tap((profile) => Profiles.save(profile)),
  );
