import { pipe } from "fp-ts/function";
import { publicProcedure, router } from "../instance";
import * as ApiResult from "../result";

// -------------------------------------------------------------------------------------
// Workflow router (lancio manuale, operatore, di un workflow configurato contro l'ADB
// target di una camera - vedi Services.runWorkflow)
// -------------------------------------------------------------------------------------

export interface WorkflowRunInput {
  readonly cameraId: string;
  readonly workflowName: string;
}

const workflowRunInput = (value: unknown): WorkflowRunInput => {
  if (value == null || typeof value !== "object") throw new Error("Expected workflow run input to be an object");

  const { cameraId, workflowName } = value as Record<string, unknown>;
  if (typeof cameraId !== "string") throw new Error("Expected cameraId to be a string");
  if (typeof workflowName !== "string") throw new Error("Expected workflowName to be a string");

  return { cameraId, workflowName };
};

export const workflowRouter = router({
  run: publicProcedure
    .input(workflowRunInput)
    .mutation(({ ctx, input }) =>
      pipe(ctx.services.runWorkflow(input.cameraId, input.workflowName), ApiResult.fromTaskEither),
    ),
});
