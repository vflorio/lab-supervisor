import { describe, expect, it } from "vitest";
import { createPredicateStream } from "./feed";

describe("predicates/feed", () => {
  it("is idempotent: emitting the same value twice only produces one entry/notification", () => {
    const stream = createPredicateStream();
    const seen: number[] = [];
    stream.subscribe((entry) => seen.push(entry.id));

    stream.emit({ domain: "d", entityId: "e1", name: "online", value: true });
    stream.emit({ domain: "d", entityId: "e1", name: "online", value: true });

    expect(seen).toEqual([0]);
    expect(stream.history()).toHaveLength(1);
  });

  it("snapshot() returns exactly one (latest) entry per (domain, entityId, name)", () => {
    const stream = createPredicateStream();

    stream.emit({ domain: "d", entityId: "e1", name: "online", value: true });
    stream.emit({ domain: "d", entityId: "e1", name: "online", value: false });
    stream.emit({ domain: "d", entityId: "e1", name: "recording", value: true });

    const snapshot = stream.snapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.find((e) => e.name === "online")?.value).toBe(false);
    expect(snapshot.find((e) => e.name === "recording")?.value).toBe(true);
  });

  it("history() respects bufferSize eviction", () => {
    const stream = createPredicateStream(2);

    stream.emit({ domain: "d", entityId: "e1", name: "a", value: 1 });
    stream.emit({ domain: "d", entityId: "e1", name: "b", value: 2 });
    stream.emit({ domain: "d", entityId: "e1", name: "c", value: 3 });

    const history = stream.history();
    expect(history).toHaveLength(2);
    expect(history.map((e) => e.name)).toEqual(["b", "c"]);
  });

  it("unsubscribe stops further notifications", () => {
    const stream = createPredicateStream();
    let count = 0;
    const unsubscribe = stream.subscribe(() => {
      count++;
    });

    stream.emit({ domain: "d", entityId: "e1", name: "online", value: true });
    unsubscribe();
    stream.emit({ domain: "d", entityId: "e1", name: "online", value: false });

    expect(count).toBe(1);
  });
});
