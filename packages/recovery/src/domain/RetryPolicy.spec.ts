import * as Duration from "@lab/kernel/Duration";
import { describe, expect, it } from "vitest";
import * as RetryPolicy from "./RetryPolicy";

describe("RetryPolicy", () => {
  it("il backoff fisso non cambia con i tentativi (FL-1 step 2, FL-2)", () => {
    const backoff = RetryPolicy.fixed(Duration.seconds(30));
    expect(Duration.toMillis(RetryPolicy.delayAfter(backoff, RetryPolicy.attemptNo(1)))).toBe(30_000);
    expect(Duration.toMillis(RetryPolicy.delayAfter(backoff, RetryPolicy.attemptNo(3)))).toBe(30_000);
  });

  it("il backoff esponenziale cresce e si ferma al cap", () => {
    const backoff = RetryPolicy.exponential(Duration.seconds(10), 2, Duration.seconds(60));
    expect(Duration.toMillis(RetryPolicy.delayAfter(backoff, RetryPolicy.attemptNo(1)))).toBe(10_000);
    expect(Duration.toMillis(RetryPolicy.delayAfter(backoff, RetryPolicy.attemptNo(3)))).toBe(40_000);
    expect(Duration.toMillis(RetryPolicy.delayAfter(backoff, RetryPolicy.attemptNo(9)))).toBe(60_000);
  });

  it("a single function answers 'can we retry?' (INV-2)", () => {
    const policy = RetryPolicy.make(2, RetryPolicy.fixed(Duration.seconds(30)));
    expect(RetryPolicy.hasAttemptsLeft(policy, RetryPolicy.attemptNo(1))).toBe(true);
    expect(RetryPolicy.hasAttemptsLeft(policy, RetryPolicy.attemptNo(2))).toBe(false);
  });
});
