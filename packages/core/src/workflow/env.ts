import type * as RTE from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import { type AppError, of } from "../errors";
import type { FactLookup } from "../fact/condition";
import type { Logger } from "../logger/logger";
import type { ProbeCapabilities } from "./probe";
import type { TapCoords, Workflow } from "./workflow";

// Env e vocabolario di errore dell'interprete, in un modulo a sé: `condition` ne ha bisogno per
// valutare le proprie foglie, e l'interprete ha bisogno di `condition` per eseguire `when`.
// Tenerli insieme sarebbe un ciclo di import a runtime.

// `cause`: preserva l'errore sottostante *con il suo tag* attraverso il mapping generico che
// appiattisce tutto in un WorkflowError. Senza, un chiamante a valle non può più distinguere
// un trasporto ADB incastrato (CommandTimeout) da un comando fallito normalmente (es. app non
// trovata). Restando un AppError, ogni nuova regola di rimedio è un `.with({ type: "..." })` in più.
export interface WorkflowError extends AppError<"WorkflowError"> {
  readonly cause?: AppError;
}

export const workflowError = of("WorkflowError");

// Comandi: cambiano lo stato del device. I probe (./probe) lo leggono soltanto.
export interface CommandCapabilities {
  readonly restartApp: (packageId: string) => TE.TaskEither<WorkflowError, void>;
  readonly ensureActivity: (packageId: string, activity: string) => TE.TaskEither<WorkflowError, void>;
  readonly openUrl: (url: string) => TE.TaskEither<WorkflowError, void>;
  readonly openDeveloperSettings: () => TE.TaskEither<WorkflowError, void>;
  readonly reboot: () => TE.TaskEither<WorkflowError, void>;
  readonly wakeUp: () => TE.TaskEither<WorkflowError, void>;
  readonly inputTap: (coords: TapCoords) => TE.TaskEither<WorkflowError, void>;
  readonly waitForDevice: () => TE.TaskEither<WorkflowError, void>;
}

export interface WorkflowEnv {
  readonly logger: Logger;
  readonly capabilities: CommandCapabilities;
  readonly workflows: readonly Workflow[];
  // Vista sui fatti applicativi correnti, per le foglie "fatto" di una Condition. Opzionale
  // perché non ogni contesto ne ha una da offrire: senza, la condizione fallisce con un
  // messaggio esplicito invece di decidere su un `false` che non distingue "falso" da "ignoto".
  // Va letta ad ogni chiamata, non catturata: `await` aspetta proprio che cambi.
  readonly lookup?: FactLookup;
  // Letture dal vivo del device, per le foglie `probe`. Opzionale con la stessa logica.
  readonly probes?: ProbeCapabilities;
  // Profondità di annidamento corrente (`run`, `when`): i workflow si richiamano per nome e
  // nulla vieta un ciclo in config - senza un bound sarebbe una ricorsione infinita, e con
  // `when` la ricorsione diventa una cosa che uno *vuole* scrivere.
  readonly depth?: number;
}

export const MAX_WORKFLOW_DEPTH = 16;

export type Effect<A> = RTE.ReaderTaskEither<WorkflowEnv, WorkflowError, A>;
