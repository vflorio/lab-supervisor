// `RelaunchSuite`: la sequenza completa di messa online dell'app di cattura (FATTO-11). È l'unico
// rimedio che non è un comando ma una procedura, ed è la ragione per cui esiste separato da
// `RestartApp` — non è un secondo riavvio, è tutto ciò che serve perché lo stream torni a esistere
// quando il device è su ma l'app non è ripartita davvero.
// Travaso del workflow `suitest-camera-reboot` del branch `main`, meno i due gradini che nel modello
// nuovo sono un rimedio a sé: `reboot` e `waitForDevice` appartengono a `RebootHardware`, e il
// playbook di FL-1 dispone questo gradino **dopo**, con la precondizione `AdbTransport` sano — cioè
// il transport c'è già, e riaspettarlo sarebbe solo tempo perso.
// Non decide nulla: se un gradino fallisce, fallisce la sequenza, e l'esito lo traduce il chiamante.

import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import * as Cli from "./Cli";
import * as Shell from "./Shell";

const pause = (ms: number): TE.TaskEither<never, void> =>
  ms <= 0 ? TE.right(undefined) : TE.fromTask(() => new Promise((resolve) => setTimeout(resolve, ms)));

// Sveglia lo schermo, e toglie il lockscreen solo se c'è davvero: su uno schermo già sbloccato la
// swipe scrolla l'app in primo piano invece di sbloccare, ed è un difetto che sul branch `main`
// era già stato pagato una volta.
const wake = (cli: Cli.AdbCli, endpoint: string): TE.TaskEither<Shell.ShellFailure, void> =>
  pipe(
    cli.wakeUp(endpoint),
    TE.flatMap(() => cli.isKeyguardShowing(endpoint)),
    TE.flatMap((showing) => (showing ? cli.dismissKeyguard(endpoint) : TE.right(undefined))),
  );

// Lancia solo se non è già in primo piano: `ensureActivity` del branch `main`. Riavviare un'app che
// sta già andando bene è il modo più rapido per rompere ciò che funziona.
const ensureForeground = (
  cli: Cli.AdbCli,
  endpoint: string,
  app: Cli.CaptureApp,
): TE.TaskEither<Shell.ShellFailure, void> =>
  pipe(
    cli.isActivityResumed(endpoint, app.activity),
    TE.flatMap((resumed) =>
      resumed
        ? TE.right<Shell.ShellFailure, void>(undefined)
        : pipe(
            cli.launch(endpoint, app.packageId),
            TE.flatMap(() => pause(app.settleAfterLaunchMs)),
          ),
    ),
  );

// Una sequenza di tap, risolti sulla dimensione vera dello schermo. Una frazione che non si può
// risolvere ferma la sequenza invece di toccare a caso: un tap nel punto sbagliato non è un
// tentativo mancato, è un tentativo che fa danno.
const tapAll = (
  cli: Cli.AdbCli,
  endpoint: string,
  taps: ReadonlyArray<Cli.Tap>,
  screen: O.Option<Cli.ScreenSize>,
): TE.TaskEither<Shell.ShellFailure, void> =>
  taps.reduce<TE.TaskEither<Shell.ShellFailure, void>>((previous, tap) => {
    const point = Cli.resolveTap(tap, screen);
    return pipe(
      previous,
      TE.flatMap(() =>
        point.x < 0
          ? TE.left(Shell.nonZeroExit(1, "dimensione dello schermo non leggibile: tap in frazione non risolvibile"))
          : cli.tap(endpoint, point),
      ),
    );
  }, TE.right(undefined));

const needsScreenSize = (app: Cli.CaptureApp): boolean =>
  [...app.profileTaps, ...app.connectTaps].some((tap) => tap._tag === "Fraction");

export const relaunchSuite = (
  cli: Cli.AdbCli,
  endpoint: string,
  app: Cli.CaptureApp,
): TE.TaskEither<Shell.ShellFailure, void> =>
  pipe(
    wake(cli, endpoint),
    TE.flatMap(() => ensureForeground(cli, endpoint, app)),
    // Si legge una volta sola, e solo se serve davvero a qualcuno dei tap.
    TE.flatMap(() =>
      needsScreenSize(app) ? cli.screenSize(endpoint) : TE.right<Shell.ShellFailure, O.Option<Cli.ScreenSize>>(O.none),
    ),
    TE.flatMap((screen) =>
      pipe(
        // Il profilo `experimental-wide` si sceglie toccando la UI, non passandolo all'intent:
        // impostazioni → profilo → experimental → indietro.
        tapAll(cli, endpoint, app.profileTaps, screen),
        TE.flatMap(() => tapAll(cli, endpoint, app.connectTaps, screen)),
      ),
    ),
    TE.asUnit,
  );
