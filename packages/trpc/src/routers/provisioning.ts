import * as Network from "@supervisor/core/network";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import { publicProcedure, router } from "../instance";
import * as Result from "../result";

// Aggiornamenti di stato si pubblicano come fatti; parser input ritorna stringa (formato wire)
const targetInput = (value: unknown): string =>
  pipe(
    Network.Codec.decode(value),
    E.fold(() => {
      throw new Error("Expected ADB target in <host>:<port> format");
    }, Network.format),
  );

// Sicuro: targetInput gia validato
const toEndpoint = (target: string): Network.Endpoint =>
  pipe(
    Network.Codec.decode(target),
    E.getOrElseW(() => {
      throw new Error(`Unreachable: ${target} passed input validation but failed to decode`);
    }),
  );

export const provisioningRouter = router({
  // UI lo usa per mostrare/nascondere il bottone
  isConfigured: publicProcedure.query(({ ctx }) => ctx.services.provisioning.isConfigured),

  refresh: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) => pipe(ctx.services.provisioning.refresh(toEndpoint(input)), Result.fromTaskEither)),

  provision: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) => pipe(ctx.services.provisioning.provision(toEndpoint(input)), Result.fromTaskEither)),
});
