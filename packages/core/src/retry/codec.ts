import * as E from "fp-ts/Either";
import * as t from "io-ts";
import { type DurationString, DurationString as DurationStringCodec, durationToMs } from "../date-time";
import { type AppError, of } from "../errors";
import { capDelay, concat, constantDelay, exponentialBackoff, limitRetries, type Policy } from "./retry";

// Formato JSON per policy componibili. Ogni step e' una tupla [nome_primitiva, ...args]
// Gli argomenti numerici possono essere espressi come:
//   - number: millisecondi diretti (es. 30000)
//   - DurationString: formato human-readable (es. "30s", "5m", "1h")
//
// es: [["constantDelay", "30s"], ["limitRetries", 5]]
//     [["exponentialBackoff", "100ms"], ["capDelay", "5s"], ["limitRetries", 10]]
//
// La composizione avviene via `concat`: tutte le primitive vengono combinate insieme.
// I modificatori (capDelay) si applicano al risultato parziale accumulato.

export type PolicyStepArg = number | DurationString;
export type PolicyStepJson = readonly [string, ...PolicyStepArg[]];
export type PolicyJson = readonly PolicyStepJson[];

// Codec per un singolo argomento di step: number o DurationString
const PolicyStepArgCodec = t.union([t.number, DurationStringCodec]);

const isPolicyStepJson = (u: unknown): u is PolicyStepJson =>
  Array.isArray(u) && u.length >= 1 && typeof u[0] === "string" && u.slice(1).every((a) => PolicyStepArgCodec.is(a));

const validateStepJson = (u: unknown, c: t.Context): t.Validation<PolicyStepJson> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [name, ...args]");

  const [head, ...tail] = u;

  if (typeof head !== "string") return t.failure(u, c, "First element must be a string (policy name)");

  for (const arg of tail) {
    if (typeof arg !== "number" && !DurationStringCodec.is(arg))
      return t.failure(u, c, `Invalid arg: ${JSON.stringify(arg)} (expected number or DurationString)`);
  }

  return t.success([head, ...tail] as unknown as PolicyStepJson);
};

const encodeStepJson = (step: PolicyStepJson): (string | number)[] =>
  [step[0], ...step.slice(1)] as unknown as (string | number)[];

// Codec per un singolo step: array con primo elemento stringa e resto args
const PolicyStepJsonCodec = new t.Type<PolicyStepJson, (string | number)[], unknown>(
  "PolicyStepJson",
  isPolicyStepJson,
  validateStepJson,
  encodeStepJson,
);

export const PolicyJsonCodec = t.array(PolicyStepJsonCodec);

export const formatPolicyJson = (json: PolicyJson): string => `[PolicyJson: ${JSON.stringify(json)}]`;

export interface PolicyDecodeError extends AppError<"PolicyDecodeError"> {}

// Registro delle primitive supportate
const PRIMITIVES: Record<string, ((...args: number[]) => Policy) | undefined> = {
  constantDelay: (delay: number) => constantDelay(delay),
  limitRetries: (count: number) => limitRetries(count),
  exponentialBackoff: (delay: number) => exponentialBackoff(delay),
};

// Registro dei modificatori (trasformano una policy esistente)
const MODIFIERS: Record<string, ((arg: number) => (policy: Policy) => Policy) | undefined> = {
  capDelay: (max: number) => capDelay(max),
};

// Risolve un argomento: DurationString -> ms, number -> passthrough
const resolveArg = (arg: PolicyStepArg): number => (typeof arg === "string" ? durationToMs(arg) : arg);

const policyDecodeError = of("PolicyDecodeError");

// Decodifica un singolo step
const decodeStep = (step: PolicyStepJson, acc: Policy | null): E.Either<PolicyDecodeError, Policy> => {
  const [name, ...rawArgs] = step;
  const args = rawArgs.map(resolveArg);

  // Prova come modificatore (richiede una policy accumulata)
  const modifier = MODIFIERS[name];
  if (modifier) {
    if (acc === null) {
      return E.left(policyDecodeError(`Modifier "${name}" no previous policy`));
    }
    const arg = args[0];
    if (arg === undefined) {
      return E.left(policyDecodeError(`Modifier "${name}" requires an argument`));
    }
    return E.right(modifier(arg)(acc));
  }

  // Prova come primitiva
  const primitive = PRIMITIVES[name];
  if (!primitive) {
    return E.left(policyDecodeError(`Policy sconosciuta: "${name}"`));
  }

  const policy = primitive(...args);

  // Se c'e' gia' un accumulo, combina con concat
  return E.right(acc === null ? policy : concat(policy)(acc));
};

// Decodifica un array di step JSON in una Policy composta
export const decode = (json: PolicyJson): E.Either<PolicyDecodeError, Policy> => {
  if (json.length === 0) {
    return E.left(policyDecodeError("Empty policy: at least one step is required"));
  }

  let acc: Policy | null = null;

  for (const step of json) {
    const result = decodeStep(step, acc);
    if (E.isLeft(result)) return result;
    acc = result.right;
  }

  return E.right(acc!);
};
