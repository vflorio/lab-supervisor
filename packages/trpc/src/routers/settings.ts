import { ActivationScheduleCodec } from "@supervisor/core/activation/schedule";
import { RecoveryPolicyCodec } from "@supervisor/core/recovery/codec";
import { WorkflowJsonCodec } from "@supervisor/core/workflow/codec";
import * as T from "io-ts";
import { decodeOrThrow, wireInput } from "../codec";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Settings router - espone la configurazione di servizio (già redatta lato service, vedi
// `ConfigModel.redact`) per la pagina Settings, in lettura e per i pochi campi editabili.
// -------------------------------------------------------------------------------------

export const settingsRouter = router({
  getConfig: publicProcedure.query(({ ctx }) => ctx.services.settings.getConfig()),

  updateActivationSchedule: publicProcedure
    .input(decodeOrThrow(ActivationScheduleCodec))
    .mutation(({ ctx, input }) => ctx.services.settings.updateActivationSchedule(input)),

  // Sostituisce l'intero array `workflows` - il client invia la rappresentazione wire
  // (tupla `[name, steps]`, vedi WorkflowJsonCodec.encode), non l'oggetto decodificato.
  updateWorkflows: publicProcedure
    .input(wireInput(T.array(WorkflowJsonCodec)))
    .mutation(({ ctx, input }) => ctx.services.settings.updateWorkflows(input)),

  // Sostituisce l'intero array `recovery` - wire form perché RecoveryPolicyCodec contiene campi
  // che trasformano la rappresentazione (predicate/pipeline/retry, stessa ragione di WorkflowJsonCodec).
  updateRecovery: publicProcedure
    .input(wireInput(T.array(RecoveryPolicyCodec)))
    .mutation(({ ctx, input }) => ctx.services.settings.updateRecovery(input)),
});
