import type * as Config from "@supervisor/core/config";
import * as Errors from "@supervisor/core/errors";
import type * as Fs from "@supervisor/core/fs";
import type * as Logger from "@supervisor/core/logger";
import * as Db from "@supervisor/core/services/db";
import * as Suitest from "@supervisor/core/services/suitest";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";

interface RegistrySyncEnv {
  readonly logger: Logger.Tagged;
  readonly fsEnv: Fs.Env;
  readonly dbPath: string;
  readonly seedDevices?: Db.LabRegistrySeed;
  readonly suitestConfig: Config.Suitest;
}

export type SyncError = Db.DbError;

// Fetch dei tre endpoint Suitest, in parallelo
// /devices ritorna TV e smart plug
// /video-capture-devices ritorna le camera
const fetchSuitestLists = (
  logger: Logger.Tagged,
  suitestConfig: Config.Suitest,
): TE.TaskEither<Suitest.SuitestError, Db.SuitestLists> => {
  const env: Suitest.Env = {
    suitestConfig,
    logger: logger.child("Suitest"),
  };

  return pipe(
    TE.Do,
    TE.bind("devices", () => Suitest.getAllDevices(env)),
    TE.bind("controlUnits", () => Suitest.getControlUnits(env)),
    TE.bind("videoCaptureDevices", () => Suitest.getVideoCaptureDevices(env)),
    TE.tapIO(({ devices, controlUnits, videoCaptureDevices }) =>
      logger.info(
        `Fetched ${devices.length} devices, ${controlUnits.length} control units, ` +
          `${videoCaptureDevices.length} video capture devices from Suitest`,
      ),
    ),
  );
};

// Se Suitest non è raggiungibile, non blocca la sync: ritorna None (warning, non un errore
// fatale), dato che il dominio applicativo (lab) è preconfigurabile e operabile offline
// indipendentemente da Suitest.
const fetchSuitestListsOrSkip = (
  logger: Logger.Tagged,
  suitestConfig: Config.Suitest,
): TE.TaskEither<never, O.Option<Db.SuitestLists>> =>
  pipe(
    fetchSuitestLists(logger, suitestConfig),
    TE.map(O.some),
    TE.orElse((err) =>
      pipe(
        TE.fromIO(logger.warn(`List fetch failed, sync skipped: ${Errors.format(err)}`)),
        TE.map((): O.Option<Db.SuitestLists> => O.none),
      ),
    ),
  );

// Registry sync:
//  init db
//    |> fetch suitest (skippato se irraggiungibile, vedi sopra)
//    |> replace mirror + auto-import control unit
//    |> write
export const sync = (env: RegistrySyncEnv): TE.TaskEither<SyncError, Db.Db> =>
  pipe(
    // Init db (crea file JSON se non esiste)
    Db.init(env.dbPath, env.seedDevices)(env.fsEnv),
    TE.tapIO(() => env.logger.info("Device Registry DB initialized")),

    TE.flatMap((currentDb) =>
      pipe(
        fetchSuitestListsOrSkip(env.logger, env.suitestConfig),
        TE.flatMap((incoming) =>
          O.isNone(incoming) ? TE.right(currentDb) : Db.syncFromSuitest(env.dbPath)(incoming.value)(env.fsEnv),
        ),
      ),
    ),

    TE.tapIO((db) => {
      const mirrored =
        Object.keys(db.suitest.devices).length +
        Object.keys(db.suitest.controlUnits).length +
        Object.keys(db.suitest.videoCaptureDevices).length;

      const controlled =
        Db.controlledCandyboxIds(db.lab).length +
        Object.values(db.lab.cameras).filter((d) => d.controlled).length +
        Object.values(db.lab.tvs).filter((d) => d.controlled).length;

      return env.logger.info(
        `Registry ready: ${mirrored} suitest entities mirrored (${controlled} lab devices controlled)`,
      );
    }),
  );
