import type * as Errors from "@supervisor/core/errors";
import * as E from "fp-ts/Either";
import type * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type ApiResult<A, Err extends Errors.AppError = Errors.AppError> =
  | { readonly ok: true; readonly data: A }
  | { readonly ok: false; readonly error: Err };

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

export const ok = <A>(data: A): ApiResult<A, never> => ({ ok: true, data });

export const fail = <Err extends Errors.AppError>(error: Err): ApiResult<never, Err> => ({
  ok: false,
  error,
});

// -------------------------------------------------------------------------------------
// Smart Constructors
// -------------------------------------------------------------------------------------

export const fromTaskEither = <Err extends Errors.AppError, A>(te: TE.TaskEither<Err, A>): Promise<ApiResult<A, Err>> =>
  te().then(
    E.fold(
      (e): ApiResult<A, Err> => ({ ok: false, error: e }),
      (a): ApiResult<A, Err> => ({ ok: true, data: a }),
    ),
  );
