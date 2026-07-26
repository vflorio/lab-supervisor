import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type * as Interpreter from "../workflow/interpreter";
import * as Compile from "./compile";
import * as EntityRunner from "./entity-runner";
import type { RecoveryTripwire } from "./model";

// -------------------------------------------------------------------------------------
// Nessun timer reale: il tempo è solo un numero passato a `observe`.
// -------------------------------------------------------------------------------------

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

// Come noopLogger, ma registra i messaggi di warn - usato per verificare gli avvisi emessi
// quando la pipeline "riesce" senza però che il predicate torni vero.
const loggerCapturingWarnings = (warnings: string[]): any => ({
  debug: () => () => {},
  info: () => () => {},
  warn: (message: string) => () => warnings.push(message),
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => loggerCapturingWarnings(warnings),
});

const capabilitiesWith = (impl: Partial<Interpreter.CommandCapabilities>): Interpreter.CommandCapabilities => ({
  restartApp: () => TE.right(undefined),
  ensureActivity: () => TE.right(undefined),
  openUrl: () => TE.right(undefined),
  openDeveloperSettings: () => TE.right(undefined),
  reboot: () => TE.right(undefined),
  wakeUp: () => TE.right(undefined),
  inputTap: () => TE.right(undefined),
  waitForDevice: () => TE.right(undefined),
  waitForActivity: () => TE.right(undefined),
  ...impl,
});

const compileOrThrow = (tripwires: readonly RecoveryTripwire[]): readonly Compile.CompiledTripwire[] => {
  const result = Compile.compileTripwires(tripwires);
  if (E.isLeft(result)) throw new Error("test setup: invalid tripwires");
  return result.right;
};

const GRACE = "1s"; // 1000ms

describe("recovery/entity-runner", () => {
  it("does not run recovery before grace has elapsed", async () => {
    const calls: string[] = [];
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      }),
    });

    const lookup = () => false; // sempre non connesso
    await runner.observe(lookup, 0);
    await runner.observe(lookup, 500); // sotto grace (1000ms)

    expect(calls).toEqual([]);
  });

  it("runs the pipeline exactly once when grace elapses, then stays quiet until it recovers", async () => {
    const calls: string[] = [];
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    let value = false;
    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        // Il reboot "riesce" (nessun comando fallito) e riporta davvero il device online:
        // è questo secondo fatto, riverificato sul predicate, a contare come successo.
        reboot: () => {
          calls.push("reboot");
          value = true;
          return TE.right(undefined);
        },
      }),
    });

    const lookup = () => value;

    await runner.observe(lookup, 0); // healthy=false -> pending(since=0)
    await runner.observe(lookup, 999); // ancora sotto grace
    expect(calls).toEqual([]);

    await runner.observe(lookup, 1000); // grace raggiunta -> fired, esegue la pipeline, il predicate torna vero
    expect(calls).toEqual(["reboot"]);

    await runner.observe(lookup, 1001); // predicate vero -> reset a healthy, non ri-esegue
    await runner.observe(lookup, 5000);
    expect(calls).toEqual(["reboot"]);

    value = false;
    await runner.observe(lookup, 6000); // nuovo episodio
    await runner.observe(lookup, 7000); // grace raggiunta di nuovo -> ri-esegue
    expect(calls).toEqual(["reboot", "reboot"]);
  });

  it("retries the pipeline according to the tripwire's retry policy before giving up", async () => {
    let attempts = 0;
    let connected = false;
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 3],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "restartApp", packageId: "pkg" }] }],
      capabilities: capabilitiesWith({
        restartApp: () => {
          attempts++;
          if (attempts >= 3) connected = true; // il 3° tentativo è quello che ripristina davvero il device
          return attempts >= 3 ? TE.right(undefined) : TE.left({ type: "WorkflowError", message: "not yet" });
        },
      }),
    });

    const lookup = () => connected;
    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000);

    expect(attempts).toBe(3);
  });

  it("does not report success when the pipeline runs cleanly but the predicate stays false", async () => {
    const calls: string[] = [];
    const outcomes: Array<"succeeded" | "exhausted"> = [];
    const warnings: string[] = [];
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "reconnect" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: loggerCapturingWarnings(warnings),
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        // Il comando "riesce" sempre (nessun errore), ma non fa mai tornare online il device:
        // rappresenta un workflow "programmato bene" e senza errori che però non basta a
        // ripristinare il predicate.
        reboot: () => {
          calls.push("reboot");
          return TE.right(undefined);
        },
      }),
      onStatus: (_index, event) => {
        if (event.type === "outcome") outcomes.push(event.outcome);
      },
    });

    const lookup = () => false; // il predicate non torna mai vero

    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000); // grace raggiunta -> esegue la pipeline, esaurisce i retry

    expect(calls).toEqual(["reboot", "reboot"]); // 1 tentativo + 1 retry (limitRetries: 1), mai marcato riuscito
    expect(outcomes).toEqual(["exhausted"]);
    // un warning per ogni tentativo in cui la pipeline è "riuscita" ma il predicate resta falso
    expect(warnings).toEqual([
      "recovery pipeline completed successfully, but predicate is still false",
      "recovery pipeline completed successfully, but predicate is still false",
    ]);
  });

  it("runs independent tripwires independently, based on each tripwire's own predicate and grace", async () => {
    const fired: string[] = [];
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: "1s",
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "tripwire-1" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
      {
        grace: "2s",
        predicate: { type: "ref", name: "recording" },
        pipeline: { type: "workflow", workflowName: "tripwire-2" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 1],
        ],
      },
    ];

    let recordingRecovered = false;
    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: noopLogger as any,
      workflows: [
        { name: "tripwire-1", commands: [{ type: "wakeUp" }] },
        { name: "tripwire-2", commands: [{ type: "reboot" }] },
      ],
      capabilities: capabilitiesWith({
        wakeUp: () => {
          fired.push("tripwire-1");
          return TE.right(undefined);
        },
        reboot: () => {
          fired.push("tripwire-2");
          recordingRecovered = true; // il reboot riporta davvero "recording" a vero
          return TE.right(undefined);
        },
      }),
    });

    // connected è sempre vero (tripwire-1 non scatta mai); recording resta falso finché
    // tripwire-2 non esegue davvero il proprio recovery
    const lookup = (name: string) => name === "connected" || (name === "recording" && recordingRecovered);

    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000); // tripwire-1 sano, non scatta; tripwire-2 ancora sotto grace (2s)
    expect(fired).toEqual([]);

    await runner.observe(lookup, 2000); // tripwire-2 raggiunge grace -> scatta
    expect(fired).toEqual(["tripwire-2"]);
  });
});
