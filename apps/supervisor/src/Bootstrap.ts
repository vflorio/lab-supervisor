// L'avviamento: il file di configurazione diventa anagrafica e profili, e lo diventa passando dai
// **casi d'uso**, non scrivendo dritto nei repository. Costa tre righe in più e ne vale la pena —
// così una topologia impossibile (una camera appesa a una CU, una quinta TV sotto la stessa CU:
// INV-12) e un playbook che non potrebbe mai risolversi (INV-6) fermano l'avvio invece di
// diventare un comportamento strano alle tre di notte.
// I device si registrano tutti prima di attaccarli: un arco ha bisogno di entrambe le estremità, e
// l'ordine in cui sono scritti nel file non è un vincolo che valga la pena imporre a chi configura.

import type { Instant } from "@lab/kernel/Instant";
import { ConfigureSupervisionProfile } from "@lab/recovery";
import { AttachDevice, RegisterDevice } from "@lab/registry";
import type { RegistryError } from "@lab/registry/domain/errors";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { Config, DeviceEntry } from "./config/Config";
import type { AppEnv } from "./Environment";

export type BootstrapError = { readonly _tag: "BootstrapFailed"; readonly detail: string };

const failed = (detail: string): BootstrapError => ({ _tag: "BootstrapFailed", detail });

const registerAll = (
  devices: ReadonlyArray<DeviceEntry>,
  now: Instant,
): RTE.ReaderTaskEither<AppEnv, RegistryError, void> =>
  pipe(
    devices,
    RTE.traverseSeqArray((entry: DeviceEntry) => RegisterDevice.execute(entry.draft, now)),
    RTE.asUnit,
  );

const attachAll = (
  devices: ReadonlyArray<DeviceEntry>,
  now: Instant,
): RTE.ReaderTaskEither<AppEnv, RegistryError, void> =>
  pipe(
    devices,
    RTE.traverseSeqArray((entry: DeviceEntry) =>
      pipe(
        entry.attach,
        O.match(
          () => RTE.right<AppEnv, RegistryError, unknown>(undefined),
          (attach) =>
            AttachDevice.execute({ deviceId: entry.draft.id, parent: attach.to, relation: attach.relation }, now),
        ),
      ),
    ),
    RTE.asUnit,
  );

const configureProfiles = (config: Config): RTE.ReaderTaskEither<AppEnv, BootstrapError, void> =>
  pipe(
    config.profiles,
    RTE.traverseSeqArray((profile) => ConfigureSupervisionProfile.execute(profile)),
    RTE.mapLeft((error) => failed(`profilo rifiutato: ${error._tag} (${error.missing.join(", ")})`)),
    RTE.asUnit,
  );

// L'anagrafica si ricostruisce a ogni avvio dal file, e va bene così finché il file è l'unica fonte
// (vedi `Persistence.ts`): un device che sparisce dalla configurazione sparisce dal lab osservato.
export const execute = (config: Config, now: Instant): RTE.ReaderTaskEither<AppEnv, BootstrapError, void> =>
  pipe(
    registerAll(config.devices, now),
    RTE.flatMap(() => attachAll(config.devices, now)),
    RTE.mapLeft((error) => failed(`anagrafica rifiutata: ${JSON.stringify(error)}`)),
    RTE.flatMap(() => configureProfiles(config)),
  );
