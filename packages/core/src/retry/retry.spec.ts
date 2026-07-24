import * as E from "fp-ts/Either";
import type * as TE from "fp-ts/TaskEither";
import { describe, expect, it } from "vitest";
import {
  capDelay,
  concat,
  constantDelay,
  exponentialBackoff,
  initialStatus,
  limitRetries,
  retryingUntil,
  type Status,
} from "./retry";

const status = (iteration: number, previousDelay: number | null = null): Status => ({
  iteration,
  previousDelay,
});

// -------------------------------------------------------------------------------------
// Primitives
// -------------------------------------------------------------------------------------

describe("constantDelay", () => {
  it("always returns the same delay", () => {
    const policy = constantDelay(1000);
    expect(policy(status(0))).toBe(1000);
    expect(policy(status(5))).toBe(1000);
    expect(policy(status(100))).toBe(1000);
  });
});

describe("limitRetries", () => {
  it("returns 0 while retries remain, null when exhausted", () => {
    const policy = limitRetries(3);
    expect(policy(status(0))).toBe(0);
    expect(policy(status(1))).toBe(0);
    expect(policy(status(2))).toBe(0);
    expect(policy(status(3))).toBe(null);
    expect(policy(status(4))).toBe(null);
  });
});

describe("exponentialBackoff", () => {
  it("doubles the delay on each iteration", () => {
    const policy = exponentialBackoff(100);
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(800);
  });
});

describe("initialStatus", () => {
  it("starts at iteration 0 with no previous delay", () => {
    expect(initialStatus.iteration).toBe(0);
    expect(initialStatus.previousDelay).toBe(null);
  });
});

// -------------------------------------------------------------------------------------
// Combinators
// -------------------------------------------------------------------------------------

describe("capDelay", () => {
  it("caps the maximum delay", () => {
    const policy = capDelay(500)(exponentialBackoff(100));
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(500); // 800 -> cap a 500
    expect(policy(status(10))).toBe(500);
  });

  it("propagates null when the policy terminates", () => {
    const policy = capDelay(500)(limitRetries(1));
    expect(policy(status(0))).toBe(0);
    expect(policy(status(1))).toBe(null);
  });
});

describe("concat", () => {
  it("continues only if both policies continue, uses the greater delay", () => {
    // exponential + limit: backoff esponenziale con massimo 3 tentativi
    const policy = concat(limitRetries(3))(constantDelay(100));
    expect(policy(status(0))).toBe(100); // max(100, 0)
    expect(policy(status(2))).toBe(100);
    expect(policy(status(3))).toBe(null); // limitRetries dice basta
  });

  it("returns null if either policy terminates", () => {
    const policy = concat(limitRetries(0))(constantDelay(100));
    expect(policy(status(0))).toBe(null);
  });

  it("composition of exponential + limit + cap", () => {
    const policy = capDelay(1000)(concat(limitRetries(5))(exponentialBackoff(100)));
    expect(policy(status(0))).toBe(100);
    expect(policy(status(1))).toBe(200);
    expect(policy(status(2))).toBe(400);
    expect(policy(status(3))).toBe(800);
    expect(policy(status(4))).toBe(1000); // cap
    expect(policy(status(5))).toBe(null); // limit
  });
});

// -------------------------------------------------------------------------------------
// Interpret
// -------------------------------------------------------------------------------------

describe("retryingUntil", () => {
  it("succeeds immediately without retrying when the action is already true", async () => {
    let calls = 0;
    const action: TE.TaskEither<never, boolean> = () => {
      calls++;
      return Promise.resolve(E.right(true));
    };

    const result = await retryingUntil(limitRetries(3))(action)();
    expect(result).toStrictEqual(E.right(true));
    expect(calls).toBe(1);
  });

  it("retries a false result until it turns true", async () => {
    let calls = 0;
    const action: TE.TaskEither<never, boolean> = () => {
      calls++;
      return Promise.resolve(E.right(calls >= 3));
    };

    const result = await retryingUntil(constantDelay(1))(action)();
    expect(result).toStrictEqual(E.right(true));
    expect(calls).toBe(3);
  });

  it("resolves to false (not an error) when the policy is exhausted", async () => {
    let calls = 0;
    const action: TE.TaskEither<never, boolean> = () => {
      calls++;
      return Promise.resolve(E.right(false));
    };

    const result = await retryingUntil(concat(limitRetries(2))(constantDelay(1)))(action)();
    expect(result).toStrictEqual(E.right(false));
    expect(calls).toBe(3); // tentativo iniziale + 2 retry
  });

  it("propagates a real Left immediately, without retrying", async () => {
    let calls = 0;
    const action: TE.TaskEither<{ message: string }, boolean> = () => {
      calls++;
      return Promise.resolve(E.left({ message: "config error" }));
    };

    const result = await retryingUntil(limitRetries(5))(action)();
    expect(result).toStrictEqual(E.left({ message: "config error" }));
    expect(calls).toBe(1);
  });
});
