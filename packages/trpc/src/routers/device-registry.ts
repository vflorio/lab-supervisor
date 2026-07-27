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
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import type { Errors } from "io-ts";
import * as T from "io-ts";
import { PathReporter } from "io-ts/PathReporter";
import { publicProcedure, router } from "../instance";
import * as ApiResult from "../result";

// -------------------------------------------------------------------------------------
// Device Registry router (CRUD for cameras, control units, TVs)
// -------------------------------------------------------------------------------------

// Il throw viene catturato da `publicProcedure` e trasformato in un errore tRPC
const decodeOrThrow =
  <A>(codec: { decode: (u: unknown) => E.Either<Errors, A> }) =>
  (value: unknown): A =>
    pipe(
      codec.decode(value),
      E.getOrElse<Errors, A>((errors) => {
        throw new Error(PathReporter.report(E.left(errors)).join("; "));
      }),
    );

// `decodeOrThrow` da solo tipizza il client sulla stessa forma del valore *decodificato*
// (tRPC, per un validatore "bare function", assume input === output). Va bene quando i campi
// del codec non trasformano la rappresentazione, ma per un codec come `AdbEntryCodec` - il cui
// campo `target` è stringa sul wire e oggetto `{ip,port}` una volta decodificato - forzerebbe il
// client a inviare già la forma decodificata, che il decode server-side rigetta. Questo wrapper
// dichiara esplicitamente input (wire, `OutputOf`) e output (decodificato, `TypeOf`) distinti.
const wireInput = <A, O>(codec: T.Type<A, O, unknown>) => ({
  _input: undefined as unknown as O,
  _output: undefined as unknown as A,
  parse: decodeOrThrow(codec),
});

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
