import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as Machine from "../state-machine/machine";
import * as LevelMachine from "./level-machine";

const GRACE = 1000;

describe("recovery/level-machine reduce", () => {
  const reduce = LevelMachine.reduce(GRACE);

  it("stays healthy while observations are healthy", () => {
    const result = reduce(LevelMachine.initial, { tag: "observe", healthy: true, now: 0 });
    expect(result).toStrictEqual(Machine.transition(LevelMachine.initial));
  });

  it("moves to pending on the first unhealthy observation, recording `since`", () => {
    const result = reduce(LevelMachine.initial, { tag: "observe", healthy: false, now: 100 });
    expect(result).toStrictEqual(Machine.transition({ tag: "pending", since: 100 }));
  });

  it("stays pending (since unchanged) while under grace", () => {
    const pending: LevelMachine.LevelState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: false, now: 100 + GRACE - 1 });
    expect(result).toStrictEqual(Machine.transition(pending));
  });

  it("fires exactly when the grace boundary is reached, emitting runRecovery", () => {
    const pending: LevelMachine.LevelState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: false, now: 100 + GRACE });
    expect(result).toStrictEqual(Machine.transition({ tag: "fired" }, [{ tag: "runRecovery" }]));
  });

  it("resets to healthy from pending on a healthy observation", () => {
    const pending: LevelMachine.LevelState = { tag: "pending", since: 100 };
    const result = reduce(pending, { tag: "observe", healthy: true, now: 5000 });
    expect(result).toStrictEqual(Machine.transition(LevelMachine.initial));
  });

  it("stays fired (no re-fire) while observations remain unhealthy", () => {
    const fired: LevelMachine.LevelState = { tag: "fired" };
    const result = reduce(fired, { tag: "observe", healthy: false, now: 999_999 });
    expect(result).toStrictEqual(Machine.transition(fired));
  });

  it("resets to healthy from fired once the predicate recovers", () => {
    const fired: LevelMachine.LevelState = { tag: "fired" };
    const result = reduce(fired, { tag: "observe", healthy: true, now: 999_999 });
    expect(result).toStrictEqual(Machine.transition(LevelMachine.initial));
  });
});

describe("recovery/level-machine make + dispatch", () => {
  it("invokes the handler and reports success when the level fires", async () => {
    const results: boolean[] = [];
    const machine = LevelMachine.make(GRACE, TE.right(true), (ok) => results.push(ok));

    const pending: LevelMachine.LevelState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE })(
      undefined,
    )();

    expect(result).toStrictEqual(E.right({ tag: "fired" }));
    expect(results).toEqual([true]);
  });

  it("reports failure when the underlying recovery exhausts without success", async () => {
    const results: boolean[] = [];
    const machine = LevelMachine.make(GRACE, TE.right(false), (ok) => results.push(ok));

    const pending: LevelMachine.LevelState = { tag: "pending", since: 0 };
    await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE })(undefined)();

    expect(results).toEqual([false]);
  });

  it("does not invoke the handler when the level merely stays pending", async () => {
    const results: boolean[] = [];
    const machine = LevelMachine.make(GRACE, TE.right(true), (ok) => results.push(ok));

    const pending: LevelMachine.LevelState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE - 1 })(
      undefined,
    )();

    expect(result).toStrictEqual(E.right(pending));
    expect(results).toEqual([]);
  });

  it("propagates a real Left from the underlying recovery action", async () => {
    const machine = LevelMachine.make(GRACE, TE.left({ type: "WorkflowError", message: "boom" }), () => {});

    const pending: LevelMachine.LevelState = { tag: "pending", since: 0 };
    const result = await Machine.dispatch(machine)(pending, { tag: "observe", healthy: false, now: GRACE })(
      undefined,
    )();

    expect(E.isLeft(result)).toBe(true);
  });
});
