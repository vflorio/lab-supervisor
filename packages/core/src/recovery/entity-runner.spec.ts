import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import type * as Interpreter from "../workflow/interpreter";
import * as Compile from "./compile";
import * as EntityRunner from "./entity-runner";
import type { RecoveryTripwire } from "./model";
import type * as TripwireMachine from "./tripwire-machine";

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

// Gate manuale per tenere una pipeline "in volo" per tutta la durata che serve al test, senza
// timer: è l'unico modo per esercitare cosa succede *durante* un recovery.
const gate = () => {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => open() };
};

// Lascia avanzare la catena RTE fino al primo punto di attesa reale della pipeline: solo
// microtask, nessun timer, così il test resta deterministico.
const flushMicrotasks = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const singleTripwire = (): readonly RecoveryTripwire[] => [
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

    await runner.observe(lookup, 1000); // grace raggiunta -> recovering, esegue la pipeline, il predicate torna vero
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
    const outcomes: Array<TripwireMachine.TripwireState["tag"]> = [];
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
      onStatus: (_index, state) => {
        if (state.tag === "exhausted" || state.tag === "fatalError") outcomes.push(state.tag);
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

  // Prima di questo refactor un vero Left della pipeline (errore di configurazione/bug, non un
  // tentativo fallito - qui: un riferimento a un workflow inesistente, vedi
  // workflow/pipeline-interpreter.ts#interpretLeaf) risaliva fino a `observe()` come Left del
  // dispatch, dove veniva solo loggato: nessun onStatus, invisibile a RecoveryStream/Activity/UI.
  // Ora diventa una transizione `fatalError` reale, riportata come qualunque altra transizione.
  // (Un comando che fallisce, es. reboot() -> TE.left, non basta a riprodurlo: viene assorbito
  // in "ranOk: false" da interpretLeaf - vedi il test "retries the pipeline..." sopra, che usa
  // esattamente questo per esercitare i retry normali, non un errore fatale.)
  it("reports a fatalError transition instead of silently swallowing a real pipeline error", async () => {
    const transitions: TripwireMachine.TripwireState[] = [];
    const tripwires: readonly RecoveryTripwire[] = [
      {
        grace: GRACE,
        predicate: { type: "ref", name: "connected" },
        pipeline: { type: "workflow", workflowName: "does-not-exist" },
        retry: [
          ["constantDelay", "1ms"],
          ["limitRetries", 3],
        ],
      },
    ];

    const runner = EntityRunner.create(compileOrThrow(tripwires), {
      logger: noopLogger as any,
      workflows: [], // il workflow referenziato non è registrato -> Left di configurazione
      capabilities: capabilitiesWith({}),
      onStatus: (_index, state) => transitions.push(state),
    });

    const lookup = () => false;
    await runner.observe(lookup, 0);
    await runner.observe(lookup, 1000); // grace raggiunta -> risoluzione del workflow fallisce con un vero Left

    expect(transitions.map((s) => s.tag)).toEqual(["pending", "recovering", "fatalError"]);
    expect(transitions[transitions.length - 1]).toStrictEqual({
      tag: "fatalError",
      error: { type: "WorkflowError", message: 'Workflow not found: "does-not-exist"' },
    });
  });

  // Una pipeline di recovery dura minuti: se lo stato del tripwire avanzasse solo a pipeline
  // conclusa, ogni osservazione che arriva nel frattempo ripartirebbe da `pending` e, trovando
  // la grace di nuovo scaduta, lancerebbe un secondo tentativo in parallelo (due reboot veri).
  it("stays in `recovering` while the pipeline is in flight, instead of starting a second attempt", async () => {
    const inFlightGate = gate();
    const calls: string[] = [];
    const states: string[] = [];

    const runner = EntityRunner.create(compileOrThrow(singleTripwire()), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () =>
          TE.fromTask(async () => {
            calls.push("reboot");
            await inFlightGate.opened; // il primo tentativo resta appeso finché non lo sblocca il test
          }),
      }),
      onStatus: (_index, state) => states.push(state.tag),
    });

    const lookup = () => false; // il predicate non torna mai vero

    await runner.observe(lookup, 0); // -> pending
    const inFlight = runner.observe(lookup, 1000); // -> recovering, la pipeline si blocca sul gate
    await flushMicrotasks();

    await runner.observe(lookup, 2000); // durante il recovery: no-op, non un secondo tentativo
    await runner.observe(lookup, 3000);
    expect(calls).toEqual(["reboot"]);
    expect(states).toEqual(["pending", "recovering"]);

    inFlightGate.open();
    await inFlight;

    expect(calls).toEqual(["reboot", "reboot"]); // 1 tentativo + 1 retry: un solo episodio
    expect(states).toEqual(["pending", "recovering", "exhausted"]);
  });

  // Un predicate che flappa durante una pipeline lunga: sano, di nuovo falso, grace di nuovo
  // scaduta. Se un'osservazione sana potesse chiudere l'episodio, il tripwire ripartirebbe da
  // `healthy` e lancerebbe un secondo tentativo mentre il primo è ancora in esecuzione.
  it("does not start a second attempt when the predicate flaps during a long recovery", async () => {
    const inFlightGate = gate();
    const calls: string[] = [];
    const states: string[] = [];
    let connected = false;

    const runner = EntityRunner.create(compileOrThrow(singleTripwire()), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () =>
          TE.fromTask(async () => {
            calls.push("reboot");
            await inFlightGate.opened;
          }),
      }),
      onStatus: (_index, state) => states.push(state.tag),
    });

    const lookup = () => connected;

    await runner.observe(lookup, 0); // -> pending
    const inFlight = runner.observe(lookup, 1000); // -> recovering, pipeline bloccata
    await flushMicrotasks();

    connected = true;
    await runner.observe(lookup, 1500); // torna sano...
    connected = false;
    await runner.observe(lookup, 2000); // ...e subito dopo di nuovo falso
    await runner.observe(lookup, 4000); // grace ampiamente scaduta

    expect(calls).toEqual(["reboot"]); // un solo tentativo in volo, non due in parallelo
    expect(states).toEqual(["pending", "recovering"]);

    inFlightGate.open();
    await inFlight;
  });

  // Lo scenario riportato dal campo: il problema viene risolto mentre la pipeline è ancora in
  // corso. L'episodio deve chiudersi come sano - a decidere è il predicate, non l'esito dei
  // comandi - e non lasciare il tripwire in uno stato terminale con il device di nuovo online.
  it("closes the episode as healthy when the predicate heals while the pipeline is in flight", async () => {
    const inFlightGate = gate();
    const states: string[] = [];
    let connected = false;

    const runner = EntityRunner.create(compileOrThrow(singleTripwire()), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        // La pipeline resta appesa e poi fallisce: da sola porterebbe a `exhausted`.
        reboot: () =>
          pipe(
            TE.fromTask(() => inFlightGate.opened),
            TE.flatMap(() => TE.left({ type: "WorkflowError", message: "boom" } as const)),
          ),
      }),
      onStatus: (_index, state) => states.push(state.tag),
    });

    const lookup = () => connected;

    await runner.observe(lookup, 0); // -> pending
    const inFlight = runner.observe(lookup, 1000); // -> recovering, pipeline bloccata
    await flushMicrotasks();

    connected = true; // l'operatore risolve il problema fisico
    await runner.observe(lookup, 1500); // resta `recovering`: il tentativo è ancora in volo

    inFlightGate.open();
    await inFlight; // i comandi falliscono, ma il predicate è tornato vero -> "succeeded"

    expect(states).toEqual(["pending", "recovering", "healthy"]);
  });

  // L'altro modo di chiudere un episodio mentre la pipeline gira: il riarmo manuale. L'esito
  // che arriva dopo appartiene a un tentativo che non è più quello corrente e va ignorato,
  // altrimenti un `exhausted` tardivo disferebbe il reset appena fatto dall'operatore.
  it("does not let a late recovery outcome undo a manual reset", async () => {
    const inFlightGate = gate();
    const states: string[] = [];

    const runner = EntityRunner.create(compileOrThrow(singleTripwire()), {
      logger: noopLogger as any,
      workflows: [{ name: "reconnect", commands: [{ type: "reboot" }] }],
      capabilities: capabilitiesWith({
        reboot: () =>
          pipe(
            TE.fromTask(() => inFlightGate.opened),
            TE.flatMap(() => TE.left({ type: "WorkflowError", message: "boom" } as const)),
          ),
      }),
      onStatus: (_index, state) => states.push(state.tag),
    });

    const lookup = () => false; // il predicate resta falso per tutto il test

    await runner.observe(lookup, 0); // -> pending
    const inFlight = runner.observe(lookup, 1000); // -> recovering, pipeline bloccata
    await flushMicrotasks();

    expect(runner.reset(0)).toBe(true); // l'operatore riarma il tripwire

    inFlightGate.open();
    await inFlight; // l'esito ("exhausted") arriva ora, ma riferito a un episodio già chiuso

    expect(states).toEqual(["pending", "recovering", "healthy"]);
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
