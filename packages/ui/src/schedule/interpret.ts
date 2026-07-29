import { MonoidIntersection, MonoidUnion, never, type Schedule, subtract } from "@supervisor/core/schedule";

export type StepOp = "union" | "intersection" | "subtract";

export interface ScheduleStep {
  readonly label: string;
  readonly schedule: Schedule;
  readonly op: StepOp;
}

const applyOp = (acc: Schedule, step: Schedule, op: StepOp): Schedule => {
  switch (op) {
    case "union":
      return MonoidUnion.concat(acc, step);
    case "intersection":
      return MonoidIntersection.concat(acc, step);
    case "subtract":
      return subtract(acc, step);
  }
};

export interface ComposedStep {
  readonly label: string;
  readonly op: StepOp;
  readonly input: Schedule;
  readonly result: Schedule;
}

// Compone una lista di step restituendo i risultati intermedi
export const composeSteps = (steps: ReadonlyArray<ScheduleStep>): ComposedStep[] =>
  steps.reduce<{ acc: Schedule; out: ComposedStep[] }>(
    ({ acc, out }, step, index) => {
      const result = index === 0 ? step.schedule : applyOp(acc, step.schedule, step.op);
      return {
        acc: result,
        out: [...out, { label: step.label, op: step.op, input: step.schedule, result }],
      };
    },
    { acc: never, out: [] },
  ).out;
