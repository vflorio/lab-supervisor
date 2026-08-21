// La macchina a stati, invariante per invariante. Ogni `describe` cita il numero di ciò che
// dimostra: INV-2, INV-3, INV-4, INV-5, INV-6, INV-7, INV-9, INV-10, INV-13.
// Nessun test tocca hardware, rete o l'orologio di sistema: il tempo è un argomento.

import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as FacetRef from "@lab/monitoring/domain/FacetRef";
import * as HealthSnapshot from "@lab/monitoring/domain/HealthSnapshot";
import * as HealthStatus from "@lab/monitoring/domain/HealthStatus";
import * as Custody from "@lab/registry/domain/Custody";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as Playbook from "../Playbook";
import type { RecoveryEvent } from "../RecoveryEvent";
import * as RecoverySessionId from "../RecoverySessionId";
import * as RecoveryTarget from "../RecoveryTarget";
import * as Remedy from "../Remedy";
import * as RemedyOutcome from "../RemedyOutcome";
import * as RemedyStep from "../RemedyStep";
import * as RetryPolicy from "../RetryPolicy";
import type { SupervisionProfile } from "../SupervisionProfile";
import * as SupervisionWindow from "../SupervisionWindow";
import * as VerificationSpec from "../VerificationSpec";
import * as RecoverySession from "./index";

const camera = DeviceId.of("cam-1");
const target = RecoveryTarget.device(camera);
const t = (seconds: number) => Instant.fromEpochMillis(seconds * 1_000);
const sec = Duration.seconds;

const verify = (facet: Facet, settle: number, poll: number, timeout: number) =>
  VerificationSpec.make(facet, sec(settle), sec(poll), sec(timeout));

// Gradino 1 di FL-1: si applica solo se il transport adb è giù, e verifica una faccia **diversa**
// da quella d'innesco.
const reconnect = RemedyStep.make({
  remedy: Remedy.reconnectTransport,
  appliesWhen: O.some(RemedyStep.when("AdbTransport", "Unhealthy")),
  dispatchTimeout: sec(10),
  verification: verify("AdbTransport", 5, 5, 30),
  retry: RetryPolicy.make(1, RetryPolicy.fixed(sec(30))),
});

// Gradino 2: si applica sempre, verifica la faccia d'innesco, due tentativi.
const restartApp = RemedyStep.make({
  remedy: Remedy.restartApp(Remedy.appRef("suitest-camera")),
  dispatchTimeout: sec(10),
  verification: verify("StreamAvailable", 10, 10, 60),
  retry: RetryPolicy.make(2, RetryPolicy.fixed(sec(30))),
});

const playbook = (steps: ReadonlyArray<RemedyStep.RemedyStep>) => {
  const built = Playbook.make(steps, "StreamAvailable");
  if (E.isLeft(built)) throw new Error(built.left._tag);
  return built.right;
};

const profile = (overrides: Partial<SupervisionProfile> = {}): SupervisionProfile => ({
  kind: "AndroidCamera",
  trigger: "StreamAvailable",
  gracePeriod: Duration.minutes(3),
  playbook: playbook([reconnect, restartApp]),
  criticality: "NotifyWhenExhausted",
  cooldownAfterGiveUp: Duration.minutes(30),
  window: SupervisionWindow.always,
  correlation: O.none,
  ...overrides,
});

type Face = readonly [Facet, "up" | "down", number];

const health = (faces: ReadonlyArray<Face>) =>
  HealthSnapshot.of(
    faces.map(([facet, state, since]) => ({
      ref: FacetRef.make(camera, facet),
      status: state === "up" ? HealthStatus.healthy(t(since)) : HealthStatus.unhealthy(t(since)),
      consecutive: 0,
      pending: O.none,
    })),
  );

type Trace = { session: RecoverySession.RecoverySession; events: ReadonlyArray<RecoveryEvent> };

const opened = (given: SupervisionProfile = profile(), outageSince = t(0)): Trace => {
  const decision = RecoverySession.open(RecoverySessionId.of("s-1"), target, given, outageSince, outageSince);
  return { session: decision.state, events: decision.events };
};

const advance = (trace: Trace, command: RecoverySession.Command): Trace => {
  const decision = RecoverySession.decide(trace.session, command);
  return { session: decision.state, events: [...trace.events, ...decision.events] };
};

const tick = (
  trace: Trace,
  at: number,
  faces: ReadonlyArray<Face>,
  extra: { custody?: Custody.Custody; window?: SupervisionWindow.SupervisionWindow } = {},
): Trace =>
  advance(trace, {
    _tag: "Tick",
    now: t(at),
    ctx: {
      window: extra.window ?? SupervisionWindow.always,
      custody: extra.custody ?? Custody.supervisor,
      health: health(faces),
    },
  });

const arrived = (trace: Trace, outcome: RemedyOutcome.RemedyOutcome, at: number): Trace =>
  advance(trace, { _tag: "RemedyOutcomeArrived", outcome, now: t(at) });

const tags = (trace: Trace) => trace.events.map((event) => event._tag);
const dispatches = (trace: Trace) => trace.events.filter((event) => event._tag === "RemedyDispatched");
const down: ReadonlyArray<Face> = [
  ["StreamAvailable", "down", 0],
  ["AdbTransport", "down", 0],
];

describe("RecoverySession · il grace e l'auto-guarigione (INV-7)", () => {
  it("prima che scada il grace non parte nessun comando", () => {
    const trace = tick(opened(), 60, down);
    expect(dispatches(trace)).toEqual([]);
    expect(trace.session.phase._tag).toBe("AwaitingGrace");
  });

  it("il bersaglio che torna sano durante il grace chiude la sessione senza dispacciare nulla", () => {
    const trace = tick(opened(), 60, [["StreamAvailable", "up", 50]]);
    expect(trace.session.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "SelfHealed" } });
    expect(dispatches(trace)).toEqual([]);
  });

  it("vale anche mentre si aspetta un ritentativo, non solo durante il grace", () => {
    const failed = arrived(tick(opened(), 200, down), RemedyOutcome.unreachable, 201);
    expect(failed.session.phase._tag).toBe("BackingOff");
    const healed = tick(failed, 210, [["StreamAvailable", "up", 205]]);
    expect(healed.session.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "SelfHealed" } });
  });
});

describe("RecoverySession · impedimenti dal contesto (INV-3)", () => {
  it("fuori dalla finestra non parte nessun comando e la sessione abortisce", () => {
    const trace = tick(opened(), 200, down, { window: SupervisionWindow.closed });
    expect(trace.session.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "OutOfWindow" } });
    expect(dispatches(trace)).toEqual([]);
  });

  it("un maintenance hold ferma la sessione e ne conserva la ragione (FATTO-15)", () => {
    const trace = tick(opened(), 200, down, { custody: Custody.operator("sostituzione cavo", t(100)) });
    expect(trace.session.phase).toMatchObject({
      _tag: "Aborted",
      reason: { _tag: "MaintenanceHold", by: "sostituzione cavo" },
    });
    expect(dispatches(trace)).toEqual([]);
  });

  it("la finestra è live: chiuderla a metà verifica ferma la sessione (INV-13)", () => {
    const verifying = arrived(tick(opened(), 200, down), RemedyOutcome.accepted, 201);
    expect(verifying.session.phase._tag).toBe("Verifying");
    const closed = tick(verifying, 210, down, { window: SupervisionWindow.closed });
    expect(closed.session.phase).toMatchObject({ _tag: "Aborted", reason: { _tag: "OutOfWindow" } });
  });
});

describe("RecoverySession · scarti ed escalation monotona (INV-4, INV-6)", () => {
  it("un gradino la cui precondizione non è soddisfatta viene scartato, non fallito", () => {
    const trace = tick(opened(), 200, [
      ["StreamAvailable", "down", 0],
      ["AdbTransport", "up", 0],
    ]);
    expect(tags(trace)).toEqual([
      "RecoverySessionOpened",
      "OutageConfirmed",
      "StepSkipped",
      "StepAdvanced",
      "RemedyDispatched",
    ]);
    expect(trace.session.history[0]).toMatchObject({ step: 0, verdict: O.some("Skipped") });
    expect(trace.session.phase).toMatchObject({ _tag: "Executing", step: 1, attempt: 1 });
  });

  it("verifica passata su faccia non-innescante: si sale di gradino senza risolversi", () => {
    const executing = tick(opened(), 200, down);
    expect(executing.session.phase).toMatchObject({ _tag: "Executing", step: 0 });
    const verifying = arrived(executing, RemedyOutcome.accepted, 201);
    // il transport è tornato dopo il dispaccio, lo stream no
    const advanced = tick(verifying, 210, [
      ["StreamAvailable", "down", 0],
      ["AdbTransport", "up", 205],
    ]);
    expect(advanced.session.phase._tag).not.toBe("Resolved");
    expect(advanced.session.phase).toMatchObject({ _tag: "BackingOff", step: 1, attempt: 1 });
    expect(tags(advanced)).toContain("VerificationSucceeded");
  });

  it("salire di gradino così non consuma tentativi: il gradino nuovo riparte dal primo", () => {
    const verifying = arrived(tick(opened(), 200, down), RemedyOutcome.accepted, 201);
    const advanced = tick(verifying, 210, [
      ["StreamAvailable", "down", 0],
      ["AdbTransport", "up", 205],
    ]);
    const dispatched = tick(advanced, 211, [
      ["StreamAvailable", "down", 0],
      ["AdbTransport", "up", 205],
    ]);
    expect(dispatched.session.phase).toMatchObject({ _tag: "Executing", step: 1, attempt: 1 });
  });
});

describe("RecoverySession · la guarigione deve essere posteriore al comando (INV-5)", () => {
  const untilVerifying = () =>
    arrived(tick(opened(profile({ playbook: playbook([restartApp]) })), 200, down), RemedyOutcome.accepted, 201);

  it("uno stato sano ereditato da prima del dispaccio non è una guarigione (FATTO-13)", () => {
    const trace = tick(untilVerifying(), 215, [["StreamAvailable", "up", 100]]);
    expect(trace.session.phase._tag).toBe("Verifying");
    expect(tags(trace)).not.toContain("DeviceRecovered");
  });

  it("si risolve solo quando il `since` è posteriore al dispaccio", () => {
    const trace = tick(untilVerifying(), 215, [["StreamAvailable", "up", 205]]);
    expect(trace.session.phase._tag).toBe("Resolved");
    expect(tags(trace)).toContain("DeviceRecovered");
  });

  it("prima dell'assestamento non si giudica affatto", () => {
    const trace = tick(untilVerifying(), 205, [["StreamAvailable", "up", 203]]);
    expect(trace.session.phase._tag).toBe("Verifying");
  });
});

describe("RecoverySession · tentativi e scadenze (INV-2, INV-10)", () => {
  const single = () => opened(profile({ playbook: playbook([restartApp]) }));

  it("un rimedio senza esito entro la scadenza è un tentativo fallito, non un'attesa infinita", () => {
    const executing = tick(single(), 200, down);
    expect(executing.session.phase).toMatchObject({ _tag: "Executing", deadline: t(210) });
    const timedOut = tick(executing, 211, down);
    expect(tags(timedOut)).toContain("RemedyTimedOut");
    expect(timedOut.session.phase).toMatchObject({ _tag: "BackingOff", attempt: 2 });
  });

  it("non si supera mai `maxAttempts` per un gradino", () => {
    let trace = tick(single(), 200, down);
    trace = arrived(trace, RemedyOutcome.unreachable, 201);
    trace = tick(trace, 240, down);
    trace = arrived(trace, RemedyOutcome.unreachable, 241);
    expect(dispatches(trace)).toHaveLength(2);
    expect(trace.session.phase._tag).toBe("GivenUp");
  });

  it("ogni fase attiva chiede un tick, ogni fase terminale non ne chiede più (NO-7)", () => {
    const executing = tick(single(), 200, down);
    expect(O.isSome(RecoverySession.nextDueAt(executing.session))).toBe(true);
    const verifying = arrived(executing, RemedyOutcome.accepted, 201);
    expect(O.isSome(RecoverySession.nextDueAt(verifying.session))).toBe(true);
    const resolved = tick(verifying, 215, [["StreamAvailable", "up", 205]]);
    expect(RecoverySession.nextDueAt(resolved.session)).toEqual(O.none);
    expect(RecoverySession.isActive(resolved.session)).toBe(false);
  });
});

describe("RecoverySession · la resa (INV-9)", () => {
  const exhaust = () => {
    let trace = tick(opened(profile({ playbook: playbook([restartApp]) })), 200, down);
    trace = arrived(trace, RemedyOutcome.unreachable, 201);
    trace = tick(trace, 240, down);
    return arrived(trace, RemedyOutcome.unreachable, 241);
  };

  it("fissa un cooldown a partire dall'istante della resa", () => {
    const trace = exhaust();
    expect(trace.session.phase).toMatchObject({
      _tag: "GivenUp",
      reason: { _tag: "PlaybookExhausted" },
      retryNotBefore: t(241 + 1800),
    });
  });

  it("è terminale e assorbe ogni comando", () => {
    const trace = exhaust();
    const after = tick(trace, 300, down);
    expect(after.session).toEqual(trace.session);
    expect(after.events).toEqual(trace.events);
  });

  it("un rimedio che quel device non saprà mai fare fa arrendere subito, senza ritentare (FL-2)", () => {
    const trace = arrived(
      tick(opened(profile({ playbook: playbook([restartApp]) })), 200, down),
      RemedyOutcome.unsupported,
      201,
    );
    expect(trace.session.phase).toMatchObject({ _tag: "GivenUp", reason: { _tag: "RemedyUnsupported" } });
    expect(dispatches(trace)).toHaveLength(1);
  });
});

describe("RecoverySession · le regole sono congelate all'apertura (INV-13)", () => {
  it("cambiare il profilo dopo l'apertura non altera la sessione in corso", () => {
    const trace = opened();
    const rulesAtOpen = trace.session.rules;
    const changed = profile({ playbook: playbook([restartApp]), cooldownAfterGiveUp: Duration.minutes(1) });
    expect(changed.playbook.steps).toHaveLength(1);
    expect(trace.session.rules).toBe(rulesAtOpen);
    expect(trace.session.rules.playbook.steps).toHaveLength(2);
    expect(Duration.toMillis(trace.session.rules.cooldownAfterGiveUp)).toBe(1_800_000);
  });
});
