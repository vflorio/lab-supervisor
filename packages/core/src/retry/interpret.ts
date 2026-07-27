import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "../logger/logger";
import { initialStatus, type Policy, type Status } from "./retry";

// -------------------------------------------------------------------------------------
// Interpret - metà impura del modello in retry.ts: prende una Policy pura (Status -> delay
// o null) e la esegue davvero, ritentando un'azione con delay reali (setTimeout) tra un
// tentativo e l'altro, con logging opzionale del progresso. Le tre varianti sotto differiscono
// solo per come riconoscono "successo" nell'azione ritentata: un Right (retrying), un valore
// che soddisfa un predicato (retryingWhile), o un booleano (retryingUntil).
// -------------------------------------------------------------------------------------

// Avanza lo Status di un'iterazione, consultando la policy per il prossimo delay
export const applyPolicy =
  (policy: Policy) =>
  (status: Status): Status => ({
    iteration: status.iteration + 1,
    previousDelay: policy(status),
  });

// Primitivo impuro: attende `ms` millisecondi, non fallisce mai
const delay = (ms: number): TE.TaskEither<never, void> =>
  TE.fromTask(() => new Promise((resolve) => setTimeout(resolve, ms)));

// Ritenta un'azione che fallisce con un Left, applicando la policy tra un tentativo e l'altro,
// finché ha successo o la policy si esaurisce (nel qual caso propaga l'ultimo errore incontrato)
export const retrying =
  (policy: Policy, logger?: Logger) =>
  <E, A>(action: TE.TaskEither<E, A>): TE.TaskEither<E, A> => {
    const apply = applyPolicy(policy);

    const loop = (status: Status): TE.TaskEither<E, A> =>
      TE.orElse<E, A, E>((error) => {
        const next = apply(status);

        const exhausted = next.previousDelay === null;
        if (exhausted) {
          logger?.debug(`Retry policy exhausted after ${status.iteration + 1} attempt(s)`)();
          return TE.left(error);
        }

        logger?.debug(
          `Retry attempt ${next.iteration}/${exhausted ? "∞" : "?"} - next delay: ${next.previousDelay}ms`,
        )();

        return TE.flatMap(() => loop(next))(delay(next.previousDelay!));
      })(action);

    return loop(initialStatus);
  };

// Come `retrying`, ma per azioni che non falliscono mai con un Left (es. Err = never) e il cui
// esito va invece giudicato con un predicato sul valore prodotto: ritenta finché
// `isSatisfied(value)` non è vero o la policy si esaurisce - in entrambi i casi ritorna
// l'ultimo valore prodotto, mai un errore (un tentativo esaurito non è un fallimento applicativo)
export const retryingWhile =
  (policy: Policy, logger?: Logger) =>
  <A>(isSatisfied: (value: A) => boolean) =>
  <E>(action: TE.TaskEither<E, A>): TE.TaskEither<E, A> => {
    const apply = applyPolicy(policy);

    const loop = (status: Status): TE.TaskEither<E, A> =>
      pipe(
        action,
        TE.flatMap((value) => {
          if (isSatisfied(value)) return TE.right(value);

          const next = apply(status);

          const exhausted = next.previousDelay === null;
          if (exhausted) {
            logger?.debug(`Retry policy exhausted after ${status.iteration + 1} attempt(s), giving up`)();
            return TE.right(value);
          }

          logger?.debug(`Retry attempt ${next.iteration} - next delay: ${next.previousDelay}ms`)();

          return TE.flatMap(() => loop(next))(delay(next.previousDelay!));
        }),
      );

    return loop(initialStatus);
  };

// Come `retryingWhile`, specializzata per azioni il cui esito è già un booleano invece di un
// valore arbitrario: ritenta finché non ritorna `true` o la policy si esaurisce (nel qual caso
// ritorna `false`, non un errore). Un vero `Left` (errore di configurazione, non un tentativo
// fallito) non viene ritentato: propaga subito, senza consumare la policy.
export const retryingUntil =
  (policy: Policy, logger?: Logger) =>
  <E>(action: TE.TaskEither<E, boolean>): TE.TaskEither<E, boolean> => {
    const apply = applyPolicy(policy);

    const loop = (status: Status): TE.TaskEither<E, boolean> =>
      pipe(
        action,
        TE.flatMap((ok) => {
          if (ok) return TE.right(true);

          const next = apply(status);

          const exhausted = next.previousDelay === null;
          if (exhausted) {
            logger?.debug(`Retry policy exhausted after ${status.iteration + 1} attempt(s), giving up`)();
            return TE.right(false);
          }

          logger?.debug(`Retry attempt ${next.iteration} - next delay: ${next.previousDelay}ms`)();

          return TE.flatMap(() => loop(next))(delay(next.previousDelay!));
        }),
      );

    return loop(initialStatus);
  };
