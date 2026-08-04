import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import * as BooleanTree from "../boolean-tree/tree";

import * as Condition from "./condition";
import type { WorkflowEnv } from "./env";
import type * as Probe from "./probe";

const noopLogger: WorkflowEnv["logger"] = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
};

const envWith = (over: Partial<WorkflowEnv>): WorkflowEnv => ({
  workflows: [],
  logger: noopLogger,
  commands: {} as WorkflowEnv["commands"],
  ...over,
});

const probes = (over: Partial<Probe.Probes> = {}): Probe.Probes => ({
  screenOn: () => TE.right(true),
  keyguardShowing: () => TE.right(false),
  activityResumed: () => TE.right(true),
  orientation: () => TE.right(true),
  ...over,
});

describe("workflow/condition", () => {
  it("evaluates fact leaves against the env lookup, exactly like a tripwire predicate", async () => {
    const env = envWith({ lookup: (name) => name === "connected" });

    expect(await Condition.evaluate(Condition.ref("connected"))(env)()).toStrictEqual(E.right(true));
    expect(await Condition.evaluate(Condition.ref("recording"))(env)()).toStrictEqual(E.right(false));
  });

  it("evaluates probe leaves through the probe capabilities", async () => {
    const env = envWith({ probes: probes({ keyguardShowing: () => TE.right(true) }) });

    expect(await Condition.evaluate(Condition.probe("keyguardShowing"))(env)()).toStrictEqual(E.right(true));
    expect(await Condition.evaluate(Condition.probe("screenOn"))(env)()).toStrictEqual(E.right(true));
  });

  it("passes probe arguments through", async () => {
    const seen: string[] = [];
    const env = envWith({
      probes: probes({
        activityResumed: (activity) => {
          seen.push(activity);
          return TE.right(true);
        },
      }),
    });

    await Condition.evaluate(Condition.probe("activityResumed", "com.example/.Main"))(env)();
    expect(seen).toEqual(["com.example/.Main"]);
  });

  // Il punto di avere una sola algebra: un tripwire predicate è già una Condition valida
  it("mixes fact and probe leaves in the same tree", async () => {
    const env = envWith({
      lookup: () => false,
      probes: probes({ screenOn: () => TE.right(true) }),
    });

    const condition = BooleanTree.and([BooleanTree.not(Condition.ref("connected")), Condition.probe("screenOn")]);

    expect(await Condition.evaluate(condition)(env)()).toStrictEqual(E.right(true));
  });

  it("short-circuits `or`: a probe is not run once a fact has decided", async () => {
    let calls = 0;
    const env = envWith({
      lookup: () => true,
      probes: probes({
        screenOn: () => {
          calls += 1;
          return TE.right(true);
        },
      }),
    });

    await Condition.evaluate(BooleanTree.or([Condition.ref("connected"), Condition.probe("screenOn")]))(env)();
    expect(calls).toBe(0);
  });

  it("short-circuits `and` on the first false", async () => {
    let calls = 0;
    const env = envWith({
      lookup: () => false,
      probes: probes({
        screenOn: () => {
          calls += 1;
          return TE.right(true);
        },
      }),
    });

    await Condition.evaluate(BooleanTree.and([Condition.ref("connected"), Condition.probe("screenOn")]))(env)();
    expect(calls).toBe(0);
  });

  // "Non sono riuscito a chiedere" non è "no": un probe rotto è un Left, non un false
  it("fails when a probe fails, instead of reading it as false", async () => {
    const env = envWith({
      probes: probes({ screenOn: () => TE.left({ type: "WorkflowError", message: "adb is not answering" }) }),
    });

    expect(E.isLeft(await Condition.evaluate(Condition.probe("screenOn"))(env)())).toBe(true);
  });

  it("fails when the env carries no probes at all", async () => {
    expect(E.isLeft(await Condition.evaluate(Condition.probe("screenOn"))(envWith({}))())).toBe(true);
  });

  it("fails when the env carries no lookup, rather than reading every fact as false", async () => {
    expect(E.isLeft(await Condition.evaluate(Condition.ref("connected"))(envWith({}))())).toBe(true);
  });
});
