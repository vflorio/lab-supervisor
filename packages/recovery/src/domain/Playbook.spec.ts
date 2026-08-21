// Il corollario strutturale di INV-6: l'ultimo gradino deve verificare la faccia d'innesco.

import * as Duration from "@lab/kernel/Duration";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Playbook from "./Playbook";
import * as Remedy from "./Remedy";
import * as RemedyStep from "./RemedyStep";
import * as RetryPolicy from "./RetryPolicy";
import * as VerificationSpec from "./VerificationSpec";

const step = (remedy: Remedy.Remedy, verifies: "StreamAvailable" | "AdbTransport") =>
  RemedyStep.make({
    remedy,
    dispatchTimeout: Duration.seconds(10),
    verification: VerificationSpec.make(verifies, Duration.seconds(5), Duration.seconds(5), Duration.seconds(30)),
    retry: RetryPolicy.make(1, RetryPolicy.fixed(Duration.seconds(30))),
  });

describe("Playbook", () => {
  it("un playbook vuoto non è una scala", () => {
    expect(Playbook.make([], "StreamAvailable")).toEqual(E.left({ _tag: "EmptyPlaybook" }));
  });

  it("un playbook che finisce verificando un'altra faccia non potrebbe mai risolversi", () => {
    const built = Playbook.make([step(Remedy.reconnectTransport, "AdbTransport")], "StreamAvailable");
    expect(E.isLeft(built) && built.left._tag).toBe("LastStepMustVerifyTrigger");
  });

  it("gradini intermedi possono verificare qualunque faccia (FL-1 step 1)", () => {
    const built = Playbook.make(
      [step(Remedy.reconnectTransport, "AdbTransport"), step(Remedy.relaunchSuite, "StreamAvailable")],
      "StreamAvailable",
    );
    expect(E.isRight(built)).toBe(true);
  });

  it("l'indice si muove solo in avanti e si esaurisce oltre l'ultimo gradino (INV-4)", () => {
    const built = Playbook.make([step(Remedy.relaunchSuite, "StreamAvailable")], "StreamAvailable");
    if (E.isLeft(built)) throw new Error(built.left._tag);
    expect(Playbook.isExhausted(built.right, Playbook.firstStep)).toBe(false);
    expect(Playbook.isExhausted(built.right, Playbook.nextStep(Playbook.firstStep))).toBe(true);
    expect(Playbook.nextStep(Playbook.firstStep)).toBeGreaterThan(Playbook.firstStep);
  });

  it("una precondizione assente significa 'si applica sempre'", () => {
    expect(O.isNone(step(Remedy.relaunchSuite, "StreamAvailable").appliesWhen)).toBe(true);
  });
});
