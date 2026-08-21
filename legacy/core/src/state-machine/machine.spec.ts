import * as RTE from "fp-ts/ReaderTaskEither";
import { describe, expect, it } from "vitest";
import * as Machine from "./machine";

// Semaforo minimale usato solo per validare il motore generico: riduttore puro,
// un comando "Wait" che l'handler risolve in un evento di follow-up ("Tick"),
// verificando che `dispatch` ricicli gli eventi fino al punto fisso.

type Light = "Red" | "Green" | "Yellow";
type Event = { readonly _tag: "Tick" };
type Command = { readonly _tag: "ScheduleTick" };

const reduce: Machine.Reducer<Light, Event, Command> = (state, _event) => {
  switch (state) {
    case "Red":
      return Machine.transition("Green");
    case "Green":
      return Machine.transition("Yellow", [{ _tag: "ScheduleTick" }]);
    case "Yellow":
      return Machine.transition("Red");
  }
};

describe("state-machine/machine", () => {
  it("applies a single event through the pure reducer", async () => {
    const handle: Machine.CommandHandler<unknown, never, Event, Command> = () => RTE.right([]);
    const machine = Machine.make(reduce, handle);

    const result = await Machine.dispatch(machine)("Red", { _tag: "Tick" })({})();
    expect(result).toStrictEqual({ _tag: "Right", right: "Green" });
  });

  it("re-dispatches follow-up events produced by a command handler until fixpoint", async () => {
    // Yellow -> genera un comando che a sua volta produce un altro Tick -> Red (nessun altro comando)
    const handle: Machine.CommandHandler<unknown, never, Event, Command> = () => RTE.right([{ _tag: "Tick" }]);
    const machine = Machine.make(reduce, handle);

    const result = await Machine.dispatch(machine)("Green", { _tag: "Tick" })({})();
    expect(result).toStrictEqual({ _tag: "Right", right: "Red" });
  });

  it("folds a sequence of external events via run", async () => {
    const handle: Machine.CommandHandler<unknown, never, Event, Command> = () => RTE.right([]);
    const machine = Machine.make(reduce, handle);

    const result = await Machine.run(machine)("Red", [{ _tag: "Tick" }, { _tag: "Tick" }])({})();
    expect(result).toStrictEqual({ _tag: "Right", right: "Yellow" });
  });

  it("composeTransitionHooks invokes every hook, in order, on each transition", async () => {
    const calls: string[] = [];
    const hookA: Machine.TransitionHook<unknown, never, Light, Event> = (from, _event, to) =>
      RTE.fromIO(() => {
        calls.push(`A:${from}->${to}`);
      });
    const hookB: Machine.TransitionHook<unknown, never, Light, Event> = (from, _event, to) =>
      RTE.fromIO(() => {
        calls.push(`B:${from}->${to}`);
      });

    const handle: Machine.CommandHandler<unknown, never, Event, Command> = () => RTE.right([]);
    const machine = Machine.make(reduce, handle, Machine.composeTransitionHooks(hookA, hookB));

    await Machine.dispatch(machine)("Red", { _tag: "Tick" })({})();

    expect(calls).toStrictEqual(["A:Red->Green", "B:Red->Green"]);
  });

  it("composeTransitionHooks filters out undefined hooks, returning undefined if none remain", () => {
    expect(Machine.composeTransitionHooks(undefined, undefined)).toBeUndefined();
  });
});
