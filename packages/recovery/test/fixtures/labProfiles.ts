// I profili reali del lab, come fixture. Nel modello finito vivranno nel composition root
// (`apps/supervisor`), che in questo giro non si scrive (NO-13): qui servono a far girare gli
// scenari sui numeri veri di FL-1 e FL-2, non su numeri inventati per il test.
//
// Il `Tv` non ha profilo, ed è voluto: una TV è monitorata e partecipa alla correlazione, ma non
// ha un recupero suo (NF-1). L'assenza di una riga qui *è* il meccanismo.

import * as Duration from "@lab/kernel/Duration";
import * as Capability from "@lab/registry/domain/Capability";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import * as CorrelationPolicy from "../../src/domain/CorrelationPolicy";
import * as CorrelationRule from "../../src/domain/CorrelationRule";
import * as Playbook from "../../src/domain/Playbook";
import * as Remedy from "../../src/domain/Remedy";
import * as RemedyStep from "../../src/domain/RemedyStep";
import * as RetryPolicy from "../../src/domain/RetryPolicy";
import * as SupervisionProfile from "../../src/domain/SupervisionProfile";
import * as SupervisionWindow from "../../src/domain/SupervisionWindow";
import * as VerificationSpec from "../../src/domain/VerificationSpec";

const seconds = Duration.seconds;
const minutes = Duration.minutes;

// Lun–Ven 09:00–18:00, ora di Roma: un'autorizzazione, non un orario (FATTO-14).
export const labWindow = SupervisionWindow.make(
  SupervisionWindow.workdays,
  SupervisionWindow.time(9),
  SupervisionWindow.time(18),
  "Europe/Rome",
);

export const captureApp = Remedy.appRef("suitest-camera");

const unwrap = <A>(either: E.Either<{ readonly _tag: string }, A>): A => {
  if (E.isLeft(either)) throw new Error(`fixture non valida: ${either.left._tag}`);
  return either.right;
};

// FL-1, la scala della camera. Ordine vincolante: è l'escalation.
const cameraPlaybook = unwrap(
  Playbook.make(
    [
      // Ha senso solo se il transport è giù, e verifica una faccia diversa da quella d'innesco:
      // se il transport torna ma lo stream no, il rimedio ha fatto il suo lavoro e si sale di
      // gradino senza consumare tentativi (INV-6).
      RemedyStep.make({
        remedy: Remedy.reconnectTransport,
        appliesWhen: O.some(RemedyStep.when("AdbTransport", "Unhealthy")),
        dispatchTimeout: seconds(30),
        verification: VerificationSpec.make("AdbTransport", seconds(5), seconds(5), seconds(30)),
        retry: RetryPolicy.make(1, RetryPolicy.fixed(seconds(30))),
      }),
      RemedyStep.make({
        remedy: Remedy.restartApp(captureApp),
        dispatchTimeout: seconds(30),
        verification: VerificationSpec.make("StreamAvailable", seconds(10), seconds(5), seconds(60)),
        retry: RetryPolicy.make(2, RetryPolicy.fixed(seconds(30))),
      }),
      RemedyStep.make({
        remedy: Remedy.rebootHardware,
        dispatchTimeout: seconds(30),
        verification: VerificationSpec.make("StreamAvailable", seconds(90), seconds(15), minutes(3)),
        retry: RetryPolicy.make(1, RetryPolicy.fixed(seconds(30))),
      }),
      // Il caso "il device è tornato su ma l'app di cattura non è ripartita". La sequenza post-boot
      // completa è responsabilità dell'ACL, non un altro gradino (FATTO-11).
      RemedyStep.make({
        remedy: Remedy.relaunchSuite,
        appliesWhen: O.some(RemedyStep.when("AdbTransport", "Healthy")),
        dispatchTimeout: seconds(30),
        verification: VerificationSpec.make("StreamAvailable", seconds(15), seconds(5), seconds(60)),
        retry: RetryPolicy.make(1, RetryPolicy.fixed(seconds(30))),
      }),
    ],
    "StreamAvailable",
  ),
);

// FL-2, la scala della CU: un solo gradino. `PowerOn` non c'è, ed è il comportamento corretto —
// una CU spenta non ha accensione fuori banda che ci sia lecito usare in questo giro (FATTO-5,
// NF-3): se il reboot non è accettato, serve una mano umana.
const controlUnitPlaybook = unwrap(
  Playbook.make(
    [
      RemedyStep.make({
        remedy: Remedy.rebootHardware,
        dispatchTimeout: seconds(30),
        verification: VerificationSpec.make("Reachable", seconds(45), seconds(15), minutes(3)),
        retry: RetryPolicy.make(2, RetryPolicy.fixed(minutes(1))),
      }),
    ],
    "Reachable",
  ),
);

export const cameraProfile = unwrap(
  SupervisionProfile.make(
    {
      kind: "AndroidCamera",
      trigger: "StreamAvailable",
      gracePeriod: minutes(3),
      playbook: cameraPlaybook,
      criticality: "NotifyWhenExhausted",
      cooldownAfterGiveUp: minutes(30),
      window: labWindow,
      correlation: O.none,
    },
    Capability.capabilitiesOfKind("AndroidCamera"),
  ),
);

export const controlUnitProfile = unwrap(
  SupervisionProfile.make(
    {
      kind: "ControlUnit",
      trigger: "Reachable",
      gracePeriod: minutes(1),
      playbook: controlUnitPlaybook,
      criticality: "NotifyWhenExhausted",
      cooldownAfterGiveUp: minutes(30),
      window: labWindow,
      // La policy di quorum vive sul profilo dell'hub, che è l'unico posto sensato (M-4).
      correlation: O.some(CorrelationPolicy.make(CorrelationRule.allChildren, minutes(1))),
    },
    Capability.capabilitiesOfKind("ControlUnit"),
  ),
);

export const labProfiles = [cameraProfile, controlUnitProfile];

// **Non esiste nel lab.** Serve a un solo scenario, S11, per rendere osservabile INV-1: senza un
// profilo per il kind `Tv` una TV non apre mai una sessione (NF-1), quindi non ci sarebbe niente
// da far assorbire da un cluster. Che questo profilo debba essere costruito apposta è di per sé la
// dimostrazione che NF-1 funziona.
export const tvProfileForTests = unwrap(
  SupervisionProfile.make(
    {
      kind: "Tv",
      trigger: "Reachable",
      gracePeriod: minutes(1),
      playbook: unwrap(
        Playbook.make(
          [
            RemedyStep.make({
              remedy: Remedy.rebootHardware,
              dispatchTimeout: seconds(30),
              verification: VerificationSpec.make("Reachable", seconds(30), seconds(15), minutes(2)),
              retry: RetryPolicy.make(1, RetryPolicy.fixed(seconds(30))),
            }),
          ],
          "Reachable",
        ),
      ),
      criticality: "NotifyWhenExhausted",
      cooldownAfterGiveUp: minutes(30),
      window: labWindow,
      correlation: O.none,
    },
    Capability.capabilitiesOfKind("Tv"),
  ),
);
