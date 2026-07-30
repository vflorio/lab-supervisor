1. I tre buchi reali
LoopWidget.tsx:19-29 chiede state, iteration, lastTickAt, nextTickAt, delayMs, policyLabel, detail. Oggi:

serve	stato attuale
iteration/lastTickAt/nextTickAt/delayMs	esistono ma solo in closure dentro task-runner.ts:32-53 (status, delay), mai osservabili
state (running/idle/stopped/exhausted/error)	non esiste: gli stati sono impliciti nel control-flow (return su exhausted, signal.aborted, e l'errore non c'è proprio — i tracker inghiottono la Left e loggano, vedi adb-tracking.ts:52-55)
policyLabel	non derivabile: Retry.Policy è (Status) => number | null, opaca. La descrizione esiste solo a monte, come PolicyJson in config
identità del loop	jobLabel?: string libero ("(Tracker) adb", "(AndroidBridge) reconcile", spesso assente → "Job: Unknown")
Più un buco strutturale: i loop nascono dentro ActiveLifecycle, che viene creato/distrutto dalla FSM di activation — quindi la telemetria non può vivere nei loop, deve vivere in uno stream di processo, come già fanno predicateStream/activityStream in service.ts:104-108.

2. Il loop diventa una FSM, con la vostra convenzione
Oggi il TaskRunner è "control-flow + variabile mutabile". Lo trasformo nella stessa forma di android-bridge: model.ts (ADT) + reduce.ts (puro) + interprete + hooks/ per l'osservabilità.


packages/core/src/task-runner/
  model.ts        LoopState, LoopEvent, LoopDescriptor, LoopEntry (wire type)
  reduce.ts       (state, event) => state   — puro, nessun clock dentro
  runner.ts       l'interprete (ex task-runner.ts): AbortController, onTick, sleep
  project.ts      LoopState -> LoopEntry (l'unica proiezione verso la UI)
  hooks/tracing.ts    logStateChange   (sostituisce i log ad-hoc di oggi)
  hooks/loop-feed.ts  forwardToLoopFeed(stream)
  stream.ts       LoopFeed / LoopStream
  index.ts

// model.ts — stato ricco (interno), non è quello che va sul filo
export type LoopState =
  | { readonly _tag: "Idle" }                                              // creato, mai avviato
  | { readonly _tag: "Ticking"; iteration: number; startedAt: number }     // onTick in volo
  | { readonly _tag: "Waiting"; iteration: number; lastTickAt: number; nextTickAt: number; delayMs: number }
  | { readonly _tag: "Failing"; iteration: number; lastTickAt: number; nextTickAt: number; delayMs: number; error: Errors.AppError }
  | { readonly _tag: "Exhausted"; iteration: number; lastTickAt: number }  // policy -> null
  | { readonly _tag: "Stopped"; iteration: number; lastTickAt?: number };  // stop() esplicito

export type LoopEvent =
  | { readonly _tag: "Started"; at: number }
  | { readonly _tag: "TickStarted"; at: number }
  | { readonly _tag: "TickSucceeded"; at: number; detail?: string }
  | { readonly _tag: "TickFailed"; at: number; error: Errors.AppError }
  | { readonly _tag: "DelayComputed"; at: number; delayMs: number }
  | { readonly _tag: "PolicyExhausted"; at: number }
  | { readonly _tag: "StopRequested"; at: number };
Due scelte da motivare:

Il timestamp sta nell'evento, non nel reducer: così reduce resta puro e testabile senza iniettare un clock (stessa disciplina di RecoveryRunnerEnv.now, ma senza il parametro).
Niente layer Command, quindi niente Machine.make/Machine.dispatch. Motivo esplicito: gli unici "comandi" del loop sarebbero RunTick/Sleep/Abort, cioè esattamente il control-flow dell'interprete; passarli per dispatch significherebbe ricostruire la ricorsione comando→evento→dispatch che stiamo togliendo. Mantengo però il vocabolario TransitionHook(from, event, to) + composeTransitionHooks, così l'osservabilità si estende come su android-bridge (machine.ts:62). Se preferisci l'aderenza totale a state-machine/machine.ts si può fare, ma è costo puro.
Bonus non richiesto ma reale: l'interprete diventa un while (!signal.aborted). Oggi task-runner.ts:53 fa return tick() dentro una async — ogni iterazione aggiunge un anello alla catena di promise non risolte, che resta viva finché il loop non si ferma. Su un loop da 1s (il tick di recovery) sono ~86k frame trattenuti al giorno.

3. Identità e policyLabel: descrittore, non stringa libera

export interface LoopDescriptor {
  readonly id: string;          // "tracker:adb", "android-bridge:reconcile", "recovery:<policy>"
  readonly label: string;       // "ADB tracking"      -> LoopWidget.label
  readonly policyLabel: string; // "constant 20s"      -> LoopWidget.policyLabel
}
create passa da posizionale a Deps (5 parametri ormai), e jobLabel sparisce: i log prendono descriptor.label.

Per policyLabel la fonte onesta è la PolicyJson, che già esiste in config (config.ts:37-40). Aggiungo in retry/codec.ts accanto a POLICY_STEP_SCHEMA:


export interface DescribedPolicy { readonly policy: Policy; readonly label: string }

export const describe = (json: PolicyJson): string => /* "exp 1s → cap 30s → max 5" */
export const described = (json: PolicyJson): E.Either<PolicyDecodeError, DescribedPolicy>
export const describedConstant = (ms: number): DescribedPolicy   // per le cadenze hardcoded
Così parseConfigPolicies in service.ts:54-69 restituisce DescribedPolicy invece di Policy: label e comportamento nascono dallo stesso JSON e non possono divergere. Le due cadenze non configurabili (ADB_RECONCILE_TICK_MS, TICK_POLICY di recovery) usano describedConstant.

4. Il canale: uno stream in più, identico agli altri

// task-runner/stream.ts — solo "valore corrente per id", niente ring buffer:
// di un heartbeat non esiste storia da riprodurre, esiste solo l'ultimo battito.
export interface LoopFeed {
  readonly subscribe: (l: (entry: LoopEntry) => void) => () => void;
  readonly snapshot: () => readonly LoopEntry[];
}
export interface LoopStream extends LoopFeed { readonly publish: (entry: LoopEntry) => void }
È l'unica differenza rispetto a ActivityStream/RecoveryStream: niente history() e niente tracked()/lastEventId nel router, perché non c'è backlog da recuperare — la forma giusta da copiare è android.devicesTail, non activity.tail.

Percorso completo, file per file:

passo	file	modifica
1	packages/core/src/task-runner/*	FSM + stream + proiezione (sostituisce task-runner.ts, che resta come re-export per non toccare i 6 import esistenti)
2	packages/core/src/retry/codec.ts	describe / described / describedConstant
3	packages/core/src/predicates/tracker.ts	i deps prendono loopStream + descriptor e li passano a TaskRunner.create
4	apps/service/src/adb/adb-tracking.ts, suitest/tracking.ts, service-lifecycle.ts, recovery/engine.ts	idem: loopStream nelle Deps/Env, un descriptor per loop
5	service.ts:104-108	const loopStream = TaskRunner.createLoopStream() accanto agli altri, passato a ServiceLifecycle.Env e a TrpcServices.create
6	core/trpc.ts:110-118	readonly loops: LoopFeed; // Service -> Web
7	packages/trpc/src/routers/loops.ts + server.ts:21	snapshot query + tail subscription
8	apps/web/hooks/useLoops.tsx	provider snapshot → subscribe, Map<id, LoopEntry>, stessa cautela ordine-snapshot di useActivity.tsx:24-27
9	apps/web/pages/registry-v3/	toServiceStripProps(loops, connection) al posto di SERVICE_STRIP_PLACEHOLDER
Sul punto 5, la conseguenza importante: lo stream sopravvive al ciclo di activation. Quando il lifecycle si ferma, ogni loop pubblica Stopped e la strip mostra "stopped" con l'ultima iteration — che è l'informazione giusta, non uno svuotamento della UI.

5. Il bordo UI: nessun layer di traduzione
La proiezione LoopState → LoopEntry avviene una volta sola, in core, e il tipo sul filo è per costruzione LoopWidgetProps meno now:


// task-runner/model.ts
export type LoopStatus = "running" | "idle" | "stopped" | "exhausted" | "error";
export interface LoopEntry {
  readonly id: string; readonly label: string; readonly policyLabel: string;
  readonly status: LoopStatus; readonly iteration: number;
  readonly lastTickAt?: number; readonly nextTickAt?: number;
  readonly delayMs?: number; readonly detail?: string; readonly timestamp: number;
}
Ticking e Waiting collassano entrambi su "running" (il loop è vivo, la distinzione non è leggibile su un muro); Failing → "error" ed è transitorio, il tick successivo riuscito torna "running". Poiché packages/ui dipende già da @supervisor/core e ne importa tipi di dominio ovunque (TripwireWizard.tsx:3-7), types.ts:5 diventa export type { LoopStatus as LoopState } from "@supervisor/core/task-runner/model" e conserva solo loopTone, che è mappatura di vista. Risultato: il page-level fa solo lookup per id, zero adattatori.

6. Tre decisioni che ti lascio
detail e lo stato error richiedono di cambiare onTick. Oggi è () => void | Promise<void> e i tracker mangiano l'errore internamente, quindi "error" non arriverebbe mai. Proposta: onTick: TE.TaskEither<AppError, string | void> — la stringa diventa detail ("14 device, 2 changed"), la Left diventa Failing, e il runner assorbe il "logga e continua" che oggi è duplicato in ogni tick (TE.match(constVoid, constVoid) in service-lifecycle.ts:89, E.isLeft in adb-tracking e tracker.ts). Sono 6 call-site. Alternativa economica: lasciare il thunk e derivare error solo dalle eccezioni — ma allora detail resta sempre vuoto e error quasi sempre irraggiungibile.
Recovery: N loop, un widget. Il tick di recovery è uno per RecoveryPolicy (runner.ts:90), la strip ne mostra uno. Non voglio inventare un'aggregazione (quale iteration?). Proposta: generalizzare SuitestTrackingCard in un LoopGroupCard { title, loops[] } — Suitest lo usa con le sue 3 righe fisse, Recovery con N righe (una per policy), e se la policy è una sola degrada a LoopWidget. Costa poco e tiene i dati onesti.
Frequenza di pubblicazione. Pubblicando ad ogni transizione, il tick di recovery da 1s produce ~2 messaggi/s per policy. Va bene per una dashboard locale, ma se preferisci si pubblica solo sui cambi di _tag più un refresh su Waiting (come forwardToActivity, che filtra from._tag === to._tag). Nota collegata: il runner di activation (activation/runner.ts:25) usa Logger.muted — rendo lo stream opzionale nei deps, così i loop interni non pubblicano affatto, coerentemente con onTransition? opzionale in Machine.
Se il design ti torna, procedo con l'implementazione partendo da core (punti 1-2, con i test su reduce puro) e poi la catena di plumbing. Dimmi solo come vuoi risolvere il punto 1, che è l'unico che cambia firme fuori dal task-runner.