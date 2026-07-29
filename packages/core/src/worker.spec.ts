import * as E from "fp-ts/Either";
import { describe, expect, it } from "vitest";
import * as IntervalLoop from "./interval-loop";
import * as Retry from "./retry/retry";

const noopLogger = {
  debug: () => () => {},
  info: () => () => {},
  warn: () => () => {},
  error: () => () => {},
  logNetwork: () => () => {},
  child: (): any => noopLogger,
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("interval-loop", () => {
  it("ticks repeatedly, respecting the delay produced by the policy", async () => {
    let ticks = 0;
    const loop = IntervalLoop.create(noopLogger, Retry.constantDelay(10), () => {
      ticks++;
    });

    const done = loop.start();
    await sleep(35);
    loop.stop();
    const result = await done;

    expect(E.isRight(result)).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(2);
  });

  it("stops on its own once the policy is exhausted (returns null)", async () => {
    let ticks = 0;
    const loop = IntervalLoop.create(noopLogger, Retry.limitRetries(2), () => {
      ticks++;
    });

    const result = await loop.start();

    expect(E.isRight(result)).toBe(true);
    expect(ticks).toBe(3); // iterations 0, 1, 2 all tick; the 3rd check finds the policy exhausted
  });

  it("stop() aborts the loop before the next tick fires", async () => {
    let ticks = 0;
    const loop = IntervalLoop.create(noopLogger, Retry.constantDelay(10), () => {
      ticks++;
    });

    const done = loop.start();
    await sleep(15);
    loop.stop();
    await done;

    const ticksAtStop = ticks;
    await sleep(30);

    expect(ticks).toBe(ticksAtStop);
  });
});
