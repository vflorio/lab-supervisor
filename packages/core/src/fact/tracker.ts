import * as E from "fp-ts/Either";
import type * as RTE from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import * as Errors from "../errors";
import * as Logger from "../logger/logger";
import type * as Retry from "../retry/retry";
import * as TaskRunner from "../task-runner";
import { type Fact, type FactValue, factKey } from "./model";
import type { FactStream } from "./stream";

// Scarica periodicamente un dominio, ne deriva un set di fatti nominati per entità, ed
// emette sullo stream solo i fatti il cui valore è realmente cambiato.

export interface TrackerConfig<Env, Err extends Errors.AppError, RawItem> {
  readonly domain: string;
  readonly keyOf: (item: RawItem) => string;
  readonly toFacts: (item: RawItem) => Readonly<Record<string, FactValue>>;
  readonly fetch: RTE.ReaderTaskEither<Env, Err, readonly RawItem[]>;
}

export interface DiffResult {
  readonly changed: readonly Fact[];
  readonly next: ReadonlyMap<string, FactValue>;
}

// Pura: dato il valore precedente per ogni (entityId, name) e la lista appena scaricata,
// ritorna solo i fatti nuovi o cambiati rispetto allo snapshot precedente.
// Nota: un'entità sparita del tutto dalla lista mantiene il suo ultimo valore noto (non
// viene "ritrattata") - limite noto e accettato in questa prima versione, coerente con il
// mirror Suitest esistente (anch'esso full-replace, senza tracking delle rimozioni).
export const diff =
  <RawItem>(
    domain: string,
    keyOf: (item: RawItem) => string,
    toFacts: (item: RawItem) => Readonly<Record<string, FactValue>>,
  ) =>
  (previous: ReadonlyMap<string, FactValue>, items: readonly RawItem[]): DiffResult => {
    const next = new Map(previous);
    const changed: Fact[] = [];

    for (const item of items) {
      const entityId = keyOf(item);

      for (const [name, value] of Object.entries(toFacts(item))) {
        const key = factKey({ domain, entityId, name });
        if (next.get(key) === value) continue;

        next.set(key, value);
        changed.push({ domain, entityId, name, value });
      }
    }

    return { changed, next };
  };

export interface TrackerDeps<Env, Err extends Errors.AppError, RawItem> {
  readonly logger: Logger.Tagged;
  readonly stream: FactStream;
  readonly policy: Retry.Policy;
  readonly config: TrackerConfig<Env, Err, RawItem>;
  readonly descriptor: TaskRunner.LoopDescriptor;
  readonly loopStream?: TaskRunner.LoopStream;
}

// Effettivo: fetch -> diff contro lo snapshot in closure -> emette i fatti cambiati -> ripete sull'TaskRunner.
// Un fallimento del fetch resta osservabile (stato "error" sul loop) ma non ferma il loop,
// il tracker riprova al prossimo tick
export const create =
  <Env, Err extends Errors.AppError, RawItem>({
    logger,
    stream,
    policy,
    config,
    descriptor,
    loopStream,
  }: TrackerDeps<Env, Err, RawItem>) =>
  (env: Env): TaskRunner.Handle => {
    const diffFor = diff<RawItem>(config.domain, config.keyOf, config.toFacts);
    let snapshot: ReadonlyMap<string, FactValue> = new Map();

    const trackerLogger = logger.child("Tracker");

    const onTick: TE.TaskEither<Errors.AppError, string | undefined> = async () => {
      const result = await config.fetch(env)();

      if (E.isLeft(result)) {
        trackerLogger.error(`${config.domain} poll failed: ${Errors.format(result.left)}`)();
        return result;
      }

      const { changed, next } = diffFor(snapshot, result.right);
      snapshot = next;

      trackerLogger.debug(`${config.domain} = ${Logger.formatJsonLog([{ changed }])}`)();

      for (const fact of changed) stream.emit(fact);

      return E.right(`${changed.length} changed`);
    };

    return TaskRunner.create({ logger: trackerLogger, descriptor, policy, onTick, loopStream });
  };
