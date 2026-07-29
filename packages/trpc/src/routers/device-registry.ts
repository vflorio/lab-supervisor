import {
  AdbEntryCodec,
  AdbUpdateInputCodec,
  CameraEntryCodec,
  CameraUpdateInputCodec,
  CandyboxEntryCodec,
  CandyboxUpdateInputCodec,
  TvEntryCodec,
  TvUpdateInputCodec,
} from "@supervisor/core/db";
import { pipe } from "fp-ts/lib/function";
import * as T from "io-ts";
import { decodeOrThrow, wireInput } from "../codec";
import { publicProcedure, router } from "../instance";
import * as ApiResult from "../result";

// -------------------------------------------------------------------------------------
// Device Registry router (CRUD for cameras, control units, TVs)
// -------------------------------------------------------------------------------------

const candyboxesRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(CandyboxUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.candyboxes.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(CandyboxEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.candyboxes.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.candyboxes.remove(input), ApiResult.fromTaskEither)),
});

const camerasRouter = router({
  // `videoCaptureDeviceId`/`adbId` sono Option<string> una volta decodificati ma stringa|null
  // sul wire (vedi wireInput) - un validatore bare-function (decodeOrThrow) forzerebbe il
  // client a inviare già un Option, che il decode server-side rigetta.
  update: publicProcedure
    .input(wireInput(CameraUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(wireInput(CameraEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.remove(input), ApiResult.fromTaskEither)),
});

const tvsRouter = router({
  // `ip` è Option<string> una volta decodificato ma stringa|null sul wire (vedi wireInput)
  update: publicProcedure
    .input(wireInput(TvUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(wireInput(TvEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.remove(input), ApiResult.fromTaskEither)),
});

const adbRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(AdbUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.adb.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(wireInput(AdbEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.adb.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.adb.remove(input), ApiResult.fromTaskEither)),
});

export const registryRouter = router({
  getAll: publicProcedure.query(({ ctx }) => pipe(ctx.services.registry.getAll(), ApiResult.fromTaskEither)),
  candyboxes: candyboxesRouter,
  cameras: camerasRouter,
  tvs: tvsRouter,
  adb: adbRouter,
});
