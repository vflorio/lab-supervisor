import * as Retry from "@supervisor/core/retry";
import { pipe } from "fp-ts/lib/function";

const testPolicy = pipe(
  Retry.constantDelay(300),
  Retry.concat(Retry.exponentialBackoff(200)),
  Retry.concat(Retry.limitRetries(10)),
  Retry.capDelay(2000),
);

const policyModelJson2 = [
  ["constantDelay", 300],
  ["concat", ["exponentialBackoff", 200]],
  ["concat", ["limitRetries", 5]],
  ["capDelay", 2000],
];

const policyJson = [
  { type: "constantDelay", delay: 300 },
  {
    type: "concat",
    policy: {
      type: "exponentialBackoff",
      delay: 200,
    },
  },
  {
    type: "concat",
    policy: {
      type: "limitRetries",
      retryCount: 5,
    },
  },
  { type: "capDelay", maxDelay: 2000 },
];

const applyPolicy =
  (policy: Retry.Policy) =>
  (status: Retry.Status): Retry.Status => ({
    iteration: status.iteration + 1,
    previousDelay: policy(status),
  });

const dryRun = (policy: Retry.Policy): ReadonlyArray<Retry.Status> => {
  const apply = applyPolicy(policy);
  let status: Retry.Status = apply(Retry.initialStatus);

  const out: Array<Retry.Status> = [status];

  while (status.previousDelay !== null) {
    status = apply(status);
    out.push(status);
  }

  return out;
};

const applyTestPolicy = applyPolicy(testPolicy);

async function runWithRetry(operation: () => Promise<void>): Promise<void> {
  let status = Retry.initialStatus;

  while (true) {
    try {
      await operation();
      return;
    } catch (err) {
      const nextStatus = applyTestPolicy(status);
      const delay = nextStatus.previousDelay;

      if (delay === null) {
        console.log("Retry policy exhausted, throwing error.");
        throw err;
      }

      console.log(`Attempt ${nextStatus.iteration}, retrying in ${delay}ms...`);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      status = nextStatus;
    }
  }
}

async function test(status = Retry.initialStatus) {
  const nextStatus = applyTestPolicy(status);
  const delay = nextStatus.previousDelay;
  if (delay === null) return;

  setTimeout(() => {
    console.log(`Attempt ${nextStatus.iteration}, retrying in ${delay}ms...`);
    test(nextStatus);
  }, delay);
}

runWithRetry(() => {
  throw new Error("test");
});
