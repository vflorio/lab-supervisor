// La guardia precoce: un playbook assurdo per quel tipo di device viene rifiutato alla nascita
// del profilo, non alla terza notte di incidenti.

import * as Duration from "@lab/kernel/Duration";
import * as Capability from "@lab/registry/domain/Capability";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Playbook from "./Playbook";
import * as Remedy from "./Remedy";
import * as RemedyStep from "./RemedyStep";
import * as RetryPolicy from "./RetryPolicy";
import * as SupervisionProfile from "./SupervisionProfile";
import * as SupervisionWindow from "./SupervisionWindow";
import * as VerificationSpec from "./VerificationSpec";

const step = (remedy: Remedy.Remedy) =>
  RemedyStep.make({
    remedy,
    dispatchTimeout: Duration.seconds(10),
    verification: VerificationSpec.make("Reachable", Duration.seconds(5), Duration.seconds(5), Duration.seconds(30)),
    retry: RetryPolicy.make(1, RetryPolicy.fixed(Duration.seconds(30))),
  });

const draft = (kind: "Tv" | "ControlUnit", remedies: ReadonlyArray<Remedy.Remedy>) => {
  const playbook = Playbook.make(remedies.map(step), "Reachable");
  if (E.isLeft(playbook)) throw new Error(playbook.left._tag);
  return {
    kind,
    trigger: "Reachable" as const,
    gracePeriod: Duration.minutes(1),
    playbook: playbook.right,
    criticality: "NotifyWhenExhausted" as const,
    cooldownAfterGiveUp: Duration.minutes(30),
    window: SupervisionWindow.always,
    correlation: O.none,
  };
};

describe("SupervisionProfile.make", () => {
  it("chiedere AdbTcp a una TV è assurdo e si vede subito", () => {
    const result = SupervisionProfile.make(
      draft("Tv", [Remedy.reconnectTransport]),
      Capability.capabilitiesOfKind("Tv"),
    );
    expect(E.isLeft(result) && result.left._tag).toBe("InvalidPlaybookForKind");
    expect(E.isLeft(result) && result.left.missing).toEqual(["AdbTcp"]);
  });

  it("il reboot di una CU è nel soprainsieme del kind, e passa (FATTO-1)", () => {
    const result = SupervisionProfile.make(
      draft("ControlUnit", [Remedy.rebootHardware]),
      Capability.capabilitiesOfKind("ControlUnit"),
    );
    expect(E.isRight(result)).toBe(true);
  });

  it("il soprainsieme del kind non dice nulla sulla singola unità: quella risponde Unsupported", () => {
    // `capabilitiesOfKind` è una guardia, non la verità: la verità è `device.capabilities`, e il
    // controllo avviene al dispaccio (FL-2).
    expect(Capability.capabilitiesOfKind("ControlUnit").has("RebootHardware")).toBe(true);
  });
});
