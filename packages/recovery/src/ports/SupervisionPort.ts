// Il mondo risolto che serve a una sessione, chiesto per bersaglio: quale policy si applica e
// com'è messo il mondo adesso.
// `contextFor` è il punto in cui finestra, custodia e salute confermata vengono lette **una
// volta** e passate per valore all'aggregato: è ciò che permette al dominio di restare puro e a
// recovery di non possedere sonde (§4.1). La salute è quella già filtrata dall'anti-flapping,
// quindi la verifica di un rimedio non può dichiarare guarito un device su un ping fortunato.

import type * as O from "fp-ts/Option";
import type { ReaderTaskEither } from "fp-ts/ReaderTaskEither";
import type * as TE from "fp-ts/TaskEither";
import type { RecoveryTarget } from "../domain/RecoveryTarget";
import type { SupervisionContext } from "../domain/SupervisionContext";
import type { SupervisionProfile } from "../domain/SupervisionProfile";

export interface SupervisionPort {
  // `none` significa "sorvegliato ma non curato": il kind non ha profilo, e non succede nulla
  // (NF-1). È il meccanismo, non una lacuna.
  readonly profileFor: (target: RecoveryTarget) => TE.TaskEither<never, O.Option<SupervisionProfile>>;
  readonly contextFor: (target: RecoveryTarget) => TE.TaskEither<never, SupervisionContext>;
}

export interface SupervisionEnv {
  readonly supervision: SupervisionPort;
}

export const profileFor =
  (target: RecoveryTarget): ReaderTaskEither<SupervisionEnv, never, O.Option<SupervisionProfile>> =>
  (env) =>
    env.supervision.profileFor(target);

export const contextFor =
  (target: RecoveryTarget): ReaderTaskEither<SupervisionEnv, never, SupervisionContext> =>
  (env) =>
    env.supervision.contextFor(target);
