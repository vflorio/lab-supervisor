import * as E from "fp-ts/Either";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as Errors from "../errors";
import * as IntervalLoop from "../interval-loop";
import * as Logger from "../logger";
import type * as Retry from "../retry/retry";
import type { PredicateStream } from "./feed";
import { factKey, type PredicateFact, type PredicateValue } from "./model";

// -------------------------------------------------------------------------------------
// Tracker - scarica periodicamente un dominio, ne deriva un set di predicati nominati per
// entità, ed emette sullo stream solo i fatti il cui valore è realmente cambiato.
// -------------------------------------------------------------------------------------

export interface TrackerConfig<Env, Err extends Errors.AppError, RawItem> {
  readonly domain: string;
  readonly keyOf: (item: RawItem) => string;
  readonly toFacts: (item: RawItem) => Readonly<Record<string, PredicateValue>>;
  readonly fetch: RTE.ReaderTaskEither<Env, Err, readonly RawItem[]>;
}

export interface DiffResult {
  readonly changed: readonly PredicateFact[];
  readonly next: ReadonlyMap<string, PredicateValue>;
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
    toFacts: (item: RawItem) => Readonly<Record<string, PredicateValue>>,
  ) =>
  (previous: ReadonlyMap<string, PredicateValue>, items: readonly RawItem[]): DiffResult => {
    const next = new Map(previous);
    const changed: PredicateFact[] = [];

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

// Effettivo: fetch -> diff contro lo snapshot in closure -> emette i fatti cambiati -> ripete sull'IntervalLoop.
// Un fallimento del fetch viene loggato e ignorato (nessuna emissione),
// il tracker riprova al prossimo tick
export const run =
  <Env, Error extends Errors.AppError, RawItem>(
    logger: Logger.Tagged,
    stream: PredicateStream,
    policy: Retry.Policy,
    config: TrackerConfig<Env, Error, RawItem>,
  ) =>
  (env: Env): IntervalLoop.Handle => {
    const diffFor = diff<RawItem>(config.domain, config.keyOf, config.toFacts);
    let snapshot: ReadonlyMap<string, PredicateValue> = new Map();

    const trackerLogger = logger.child("Tracker");

    const tick = async (): Promise<void> => {
      const result = await config.fetch(env)();

      if (E.isLeft(result)) {
        trackerLogger.error(`${config.domain} poll failed: ${Errors.format(result.left)}`)();
        return;
      }

      const { changed, next } = diffFor(snapshot, result.right);
      snapshot = next;

      trackerLogger.info(`${config.domain} tick - changed facts: ${changed.length}`)();
      trackerLogger.debug(`${config.domain} = ${Logger.formatJsonLog([{ changed }])}`)();

      for (const fact of changed) stream.emit(fact);
    };

    return IntervalLoop.create(trackerLogger, policy, tick, `(Tracker) ${config.domain}`);
  };
