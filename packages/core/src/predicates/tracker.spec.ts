import * as E from "fp-ts/Either";
import type * as RTE from "fp-ts/ReaderTaskEither";
import { describe, expect, it } from "vitest";
import type { AppError } from "../errors";
import * as Retry from "../retry/retry";
import { createPredicateStream } from "./feed";
import type { PredicateEntry } from "./model";
import { create, diff } from "./tracker";

interface Item {
  readonly id: string;
  readonly online: boolean;
  readonly recording: boolean;
}

const toFacts = (item: Item) => ({ online: item.online, recording: item.recording });
const keyOf = (item: Item) => item.id;

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("predicates/tracker diff", () => {
  it("emits facts for a brand-new entity", () => {
    const { changed } = diff<Item>("d", keyOf, toFacts)(new Map(), [{ id: "e1", online: true, recording: false }]);

    expect(changed).toEqual([
      { domain: "d", entityId: "e1", name: "online", value: true },
      { domain: "d", entityId: "e1", name: "recording", value: false },
    ]);
  });

  it("emits nothing when the fetched value is unchanged", () => {
    const diffFor = diff<Item>("d", keyOf, toFacts);
    const first = diffFor(new Map(), [{ id: "e1", online: true, recording: false }]);
    const second = diffFor(first.next, [{ id: "e1", online: true, recording: false }]);

    expect(second.changed).toEqual([]);
  });

  it("emits only the fact that actually changed among several for the same entity", () => {
    const diffFor = diff<Item>("d", keyOf, toFacts);
    const first = diffFor(new Map(), [{ id: "e1", online: true, recording: false }]);
    const second = diffFor(first.next, [{ id: "e1", online: true, recording: true }]);

    expect(second.changed).toEqual([{ domain: "d", entityId: "e1", name: "recording", value: true }]);
  });

  it("namespaces by domain so the same entityId in two domains doesn't collide", () => {
    const diffFor = diff<Item>("domain-a", keyOf, toFacts);
    const other = diff<Item>("domain-b", keyOf, toFacts);

    const a = diffFor(new Map(), [{ id: "e1", online: true, recording: false }]);
    const b = other(a.next, [{ id: "e1", online: false, recording: false }]);

    expect(b.changed).toEqual([
      { domain: "domain-b", entityId: "e1", name: "online", value: false },
      { domain: "domain-b", entityId: "e1", name: "recording", value: false },
    ]);
  });

  it("keeps the last known value for an entity that disappears from the fetched list", () => {
    const diffFor = diff<Item>("d", keyOf, toFacts);
    const first = diffFor(new Map(), [{ id: "e1", online: true, recording: false }]);
    const second = diffFor(first.next, []);

    expect(second.changed).toEqual([]);
    expect(second.next.get("d:e1:online")).toBe(true);
  });
});

describe("predicates/tracker run", () => {
  it("logs and swallows a fetch failure, without emitting, and keeps ticking", async () => {
    let calls = 0;
    const error: AppError = { type: "TestError", message: "boom" };
    const fetch: RTE.ReaderTaskEither<unknown, AppError, readonly Item[]> = () => async () => {
      calls++;
      return E.left(error);
    };

    const stream = createPredicateStream();
    const emitted: PredicateEntry[] = [];
    stream.subscribe((entry) => emitted.push(entry));

    const handle = create(noopLogger, stream, Retry.constantDelay(5), { domain: "d", keyOf, toFacts, fetch })({});

    const done = handle.start();
    await sleep(20);
    handle.stop();
    await done;

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(emitted).toEqual([]);
  });

  it("emits changed facts to the stream on each successful tick", async () => {
    let call = 0;
    const items: readonly Item[][] = [
      [{ id: "e1", online: false, recording: false }],
      [{ id: "e1", online: true, recording: false }],
    ];
    const fetch: RTE.ReaderTaskEither<unknown, AppError, readonly Item[]> = () => async () => {
      const result = items[Math.min(call, items.length - 1)]!;
      call++;
      return E.right(result);
    };

    const stream = createPredicateStream();
    const emitted: PredicateEntry[] = [];
    stream.subscribe((entry) => emitted.push(entry));

    const handle = create(noopLogger, stream, Retry.constantDelay(5), { domain: "d", keyOf, toFacts, fetch })({});

    const done = handle.start();
    await sleep(20);
    handle.stop();
    await done;

    expect(emitted.some((e) => e.name === "online" && e.value === true)).toBe(true);
  });
});
