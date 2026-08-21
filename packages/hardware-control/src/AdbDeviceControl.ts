// ACL verso adb over TCP: è il solo canale con cui si comandano le camere (FATTO-11).
// Travaso di `legacy/core/src/adapters/adb/**` e `android-bridge/**`; da `android-bridge/model.ts`
// vengono le due lezioni che qui contano davvero. La prima: un transport "incastrato" non si ripara
// riconnettendosi, perché la entry stale resta — serve un `adb disconnect` esplicito prima
// (`TransportSuspect`). La seconda: un reboot dispacciato **non** è un device già spento
// (`RebootDispatched` vs `ConnectionLost`), ed è FATTO-13.
// La sequenza post-boot di `RelaunchSuite` è lenta e storicamente inaffidabile: la sua complessità
// sta qui, non nel dominio, che del rimedio conosce solo il nome.
// Qualunque chiamata verso adb può restare appesa (FATTO-12): ogni comando ha un timeout proprio e
// il fallimento torna come `TransportError`, perché la porta non ha canale d'errore (A-6).

import type { Remedy } from "@lab/recovery/domain/Remedy";
import { requiredCapability } from "@lab/recovery/domain/Remedy";
import * as RemedyOutcome from "@lab/recovery/domain/RemedyOutcome";
import type { DeviceControlPort } from "@lab/recovery/ports/DeviceControlPort";
import type { Device } from "@lab/registry/domain/Device";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import type { DeviceLookup } from "./DeviceLookup";
import * as Cli from "./internal/adb/Cli";
import * as PostBoot from "./internal/adb/PostBoot";
import * as Shell from "./internal/adb/Shell";

export type { AdbConfig, CaptureApp, Point, ScreenSize, Tap } from "./internal/adb/Cli";
export { fraction, pixels } from "./internal/adb/Cli";

export type Options = {
  readonly lookup: DeviceLookup;
  readonly spawn?: Shell.Spawn;
};

// Il fallimento di un comando è sempre un guasto del canale, mai un rifiuto del device: adb non
// discute, o esegue o non risponde. `Unreachable` è il caso in cui il transport non esiste proprio.
const toOutcome = (failure: Shell.ShellFailure): RemedyOutcome.RemedyOutcome => {
  switch (failure._tag) {
    case "Timeout":
      return RemedyOutcome.transportError(`adb appeso oltre ${failure.afterMs}ms`);
    case "NonZeroExit":
      // `device not found` / `device offline`: il transport non c'è, e non è un errore nostro.
      return /not found|offline|no devices|device unauthorized/i.test(failure.stderr)
        ? RemedyOutcome.unreachable
        : RemedyOutcome.transportError(Shell.describe(failure));
    case "SpawnFailed":
      return RemedyOutcome.transportError(Shell.describe(failure));
  }
};

const dispatched = <A>(effect: TE.TaskEither<Shell.ShellFailure, A>): T.Task<RemedyOutcome.RemedyOutcome> =>
  pipe(
    effect,
    // `Accepted` significa "il comando è stato preso in carico", non "il device è guarito": fra un
    // `adb reboot` e lo spegnimento vero passano secondi (FATTO-13, INV-5).
    TE.matchW(toOutcome, () => RemedyOutcome.accepted),
  );

export const make = (config: Cli.AdbConfig, options: Options): DeviceControlPort => {
  const cli = Cli.make(config, options.spawn);

  const attempt = (endpoint: string, remedy: Remedy): T.Task<RemedyOutcome.RemedyOutcome> => {
    switch (remedy._tag) {
      // Disconnect prima di connect, sempre: un transport incastrato sopravvive a un `adb connect`
      // nudo, perché la entry stale resta al suo posto finché non la si toglie a mano.
      case "ReconnectTransport":
        return dispatched(
          pipe(
            cli.disconnectQuietly(endpoint),
            TE.flatMap(() => cli.connect(endpoint)),
          ),
        );

      // Il nome dell'app viene dal dominio (`AppRef`), che lo tratta come opaco: qui torna a essere
      // un package id Android.
      case "RestartApp":
        return dispatched(
          pipe(
            cli.forceStop(endpoint, String(remedy.app)),
            TE.flatMap(() => cli.launch(endpoint, String(remedy.app))),
          ),
        );

      case "RelaunchSuite":
        return dispatched(PostBoot.relaunchSuite(cli, endpoint, config.captureApp));

      case "RebootHardware":
        return dispatched(cli.reboot(endpoint));

      // Una camera non ha accensione remota: è un telefono, e chi lo accende è una persona.
      case "PowerOn":
        return T.of(RemedyOutcome.unsupported);
    }
  };

  const resolve = (device: Device, remedy: Remedy): T.Task<RemedyOutcome.RemedyOutcome> => {
    // Solo le camere si comandano via adb. Un altro kind qui è un errore di instradamento, e la
    // risposta giusta resta `Unsupported`: non è questo adapter a sapere chi altro potrebbe farcela.
    if (device.kind !== "AndroidCamera") return T.of(RemedyOutcome.unsupported);

    // Ciò che *quella istanza* dichiara, non ciò che il suo tipo potrebbe fare (FATTO-1, FL-2).
    if (!device.capabilities.has(requiredCapability(remedy))) return T.of(RemedyOutcome.unsupported);

    return pipe(
      device.endpoints.adb,
      O.match(
        // Una camera può esistere in anagrafica senza endpoint adb (FATTO-9). Non è un guasto
        // dell'hardware, è una riconciliazione che manca, e va scritta nel dossier con quelle parole.
        () => T.of(RemedyOutcome.rejected("nessun endpoint adb per questo device")),
        (endpoint) => attempt(String(endpoint), remedy),
      ),
    );
  };

  return {
    apply: (deviceId, remedy) =>
      pipe(
        options.lookup(deviceId),
        TE.flatMapTask(
          O.match(
            () => T.of(RemedyOutcome.rejected(`device ${deviceId} non presente in anagrafica`)),
            (device: Device) => resolve(device, remedy),
          ),
        ),
      ),
  };
};
