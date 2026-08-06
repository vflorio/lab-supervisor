import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type { FactLookup } from "../fact";
import * as Machine from "../state-machine/machine";
import * as TripwireMachine from "./tripwire-machine";

const GRACE = 1000;

// Non usato dal reducer (pura logica di stato): serve solo a soddisfare il tipo di Observe/RunRecovery.
const lookup: FactLookup = () => undefined;

describe("recovery/tripwire-machine reduce", () => {
  const reduce = TripwireMachine.reduce(GRACE);

  it("stays healthy while observations are healthy", () => {
    const result = reduce(TripwireMachine.initial, { tag: "observe", healthy: true, now: 0, lookup });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });

  it("moves to pending on the first unhealthy observation, recording `since`", () => {
    const result = reduce(TripwireMachine.initial, { tag: "observe", healthy: false, now: 100, lookup });
    expect(result).toStrictEqual(Machine.transition({ tag: "pending", since: 100 }));
  });

  it("stays pending (since unchanged) while under grace", () => {
    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: false, now: 100 + GRACE - 1, lookup });
    expect(result).toStrictEqual(Machine.transition(pending));
  });

  it("fires (recovering) exactly when the grace boundary is reached, emitting runRecovery", () => {
    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: false, now: 100 + GRACE, lookup });
    expect(result).toStrictEqual(
      Machine.transition({ tag: "recovering", since: 100 + GRACE }, [
        { tag: "runRecovery", attempt: 100 + GRACE, lookup },
      ]),
    );
  });

  it("resets to healthy from pending on a healthy observation", () => {
    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: true, now: 5000, lookup });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });

  it("stays recovering (no re-fire) while observed again before the outcome arrives", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 1100 };
    const result = reduce(recovering, { tag: "observe", healthy: false, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(recovering));
  });

  // `recovering` è l'unico stato che descrive un effetto in corso: un predicate tornato sano non
  // chiude l'episodio, perché la pipeline (es. un reboot) sta ancora girando. A chiuderlo è il
  // suo esito - che rivaluta il predicate e tornerà "succeeded". Senza questa regola un predicate
  // che flappa porterebbe a un secondo tentativo in parallelo al primo.
  it("stays recovering even on a healthy observation: only the attempt's outcome closes the episode", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 1100 };
    const result = reduce(recovering, { tag: "observe", healthy: true, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(recovering));
  });

  it("moves to healthy on a succeeded recoveryOutcome from recovering", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 1100 };
    const result = reduce(recovering, { tag: "recoveryOutcome", attempt: 1100, outcome: "succeeded" });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });

  it("moves to exhausted on an exhausted recoveryOutcome from recovering", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 1100 };
    const result = reduce(recovering, { tag: "recoveryOutcome", attempt: 1100, outcome: "exhausted" });
    expect(result).toStrictEqual(Machine.transition({ tag: "exhausted" }));
  });

  it("moves to fatalError, carrying the error, on a fatalError recoveryOutcome from recovering", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 1100 };
    const error = { type: "WorkflowError", message: "boom" };
    const result = reduce(recovering, { tag: "recoveryOutcome", attempt: 1100, outcome: "fatalError", error });
    expect(result).toStrictEqual(Machine.transition({ tag: "fatalError", error }));
  });

  // Scenario: reset manuale mentre la pipeline è ancora in volo, predicate di nuovo falso, nuovo
  // tentativo partito. L'esito del primo arriva in ritardo e non deve toccare il secondo.
  it("ignores the outcome of an attempt that is no longer the current one", () => {
    const recovering: TripwireMachine.TripwireState = { tag: "recovering", since: 5000 };
    const result = reduce(recovering, { tag: "recoveryOutcome", attempt: 1100, outcome: "exhausted" });
    expect(result).toStrictEqual(Machine.transition(recovering));
  });

  it("ignores a late outcome once the episode has been closed by a manual reset", () => {
    const result = reduce(TripwireMachine.initial, { tag: "recoveryOutcome", attempt: 1100, outcome: "exhausted" });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });

  it("stays exhausted (no re-fire) while observations remain unhealthy", () => {
    const exhausted: TripwireMachine.TripwireState = { tag: "exhausted" };
    const result = reduce(exhausted, { tag: "observe", healthy: false, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(exhausted));
  });

  it("resets to healthy from exhausted once the predicate recovers on its own", () => {
    const exhausted: TripwireMachine.TripwireState = { tag: "exhausted" };
    const result = reduce(exhausted, { tag: "observe", healthy: true, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });

  it("stays fatalError (preserving the error) while observations remain unhealthy", () => {
    const error = { type: "WorkflowError", message: "boom" };
    const fatalError: TripwireMachine.TripwireState = { tag: "fatalError", error };
    const result = reduce(fatalError, { tag: "observe", healthy: false, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(fatalError));
  });

  it("resets to healthy from fatalError once the predicate recovers on its own", () => {
    const fatalError: TripwireMachine.TripwireState = { tag: "fatalError", error: { type: "X", message: "boom" } };
    const result = reduce(fatalError, { tag: "observe", healthy: true, now: 999_999, lookup });
    expect(result).toStrictEqual(Machine.transition(TripwireMachine.initial));
  });
});

describe("recovery/tripwire-machine make + dispatch", () => {
  it("invokes the handler and reaches healthy again when the tripwire fires and recovery succeeds", async () => {
    const machine = TripwireMachine.make(GRACE, () => TE.right(true));

    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE, lookup })(
      undefined,
    )();

    expect(result).toStrictEqual(E.right(TripwireMachine.initial));
  });

  it("reaches exhausted when the underlying recovery exhausts without success", async () => {
    const machine = TripwireMachine.make(GRACE, () => TE.right(false));

    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE, lookup })(
      undefined,
    )();

    expect(result).toStrictEqual(E.right({ tag: "exhausted" }));
  });

  it("does not invoke the handler when the tripwire merely stays pending", async () => {
    const machine = TripwireMachine.make(GRACE, () => TE.right(true));

    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, {
      tag: "observe",
      healthy: false,
      now: GRACE - 1,
      lookup,
    })(undefined)();

    expect(result).toStrictEqual(E.right(pending));
  });

  // Prima di questo refactor un vero Left della pipeline propagava come Left del dispatch
  // stesso ed entity-runner.ts lo inghiottiva in un log, invisibile a valle. Ora diventa una
  // transizione reale (fatalError), sempre un Right: questa inversione è la prova che il bug
  // è chiuso, non solo un cambio cosmetico dell'ADT.
  it("turns a real Left from the underlying recovery action into a fatalError transition, not a dispatch Left", async () => {
    const error = { type: "WorkflowError", message: "boom" };
    const machine = TripwireMachine.make(GRACE, () => TE.left(error));

    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE, lookup })(
      undefined,
    )();

    expect(result).toStrictEqual(E.right({ tag: "fatalError", error }));
  });

  it("reports every transition, in order, through the onTransition hook - including the intermediate 'recovering' state", async () => {
    const transitions: string[] = [];
    const onTransition: Machine.TransitionHook<unknown, never, TripwireMachine.TripwireState, TripwireMachine.Event> =
      (from, _event, to) => () => {
        if (from.tag !== to.tag) transitions.push(`${from.tag}->${to.tag}`);
        return TE.right(undefined);
      };

    const machine = TripwireMachine.make(GRACE, () => TE.right(false), onTransition);

    const pending: TripwireMachine.TripwireState = { tag: "pending", since: 0 };
    await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE, lookup })(undefined)();

    expect(transitions).toEqual(["pending->recovering", "recovering->exhausted"]);
  });
});
