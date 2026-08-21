// I rifiuti che il modello prevede: sono esiti, non guasti. Un guasto tecnico non arriva mai
// fin qui — lo traduce l'adapter prima di attraversare la porta (A-6).

import type { Facet } from "@lab/monitoring/domain/Facet";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import type { RecoverySessionId } from "./RecoverySessionId";

// INV-6, corollario strutturale: un playbook il cui ultimo gradino verifica una faccia diversa
// da quella d'innesco non potrebbe mai risolversi. È un errore di configurazione, e va visto
// alla nascita del profilo, non alla terza notte di incidenti.
export type LastStepMustVerifyTrigger = {
  readonly _tag: "LastStepMustVerifyTrigger";
  readonly trigger: Facet;
  readonly lastStepVerifies: Facet;
};

export type EmptyPlaybook = { readonly _tag: "EmptyPlaybook" };

// Il playbook chiede a un kind un rimedio che quel kind non potrà mai eseguire (chiedere
// `AdbTcp` a una TV). Guardia precoce sul soprainsieme del kind, non sull'istanza.
export type InvalidPlaybookForKind = {
  readonly _tag: "InvalidPlaybookForKind";
  readonly kind: DeviceKind;
  readonly missing: ReadonlyArray<string>;
};

// La sessione ha ricevuto un comando che nella sua fase non ha significato (un esito di
// rimedio quando non ne è stato dispacciato nessuno, un tick su una fase terminale).
export type SessionNotActionable = {
  readonly _tag: "SessionNotActionable";
  readonly sessionId: RecoverySessionId;
  readonly phase: string;
};

export type RecoveryError = LastStepMustVerifyTrigger | EmptyPlaybook | InvalidPlaybookForKind | SessionNotActionable;

export const emptyPlaybook: EmptyPlaybook = { _tag: "EmptyPlaybook" };

export const lastStepMustVerifyTrigger = (trigger: Facet, lastStepVerifies: Facet): LastStepMustVerifyTrigger => ({
  _tag: "LastStepMustVerifyTrigger",
  trigger,
  lastStepVerifies,
});

export const invalidPlaybookForKind = (kind: DeviceKind, missing: ReadonlyArray<string>): InvalidPlaybookForKind => ({
  _tag: "InvalidPlaybookForKind",
  kind,
  missing,
});

export const sessionNotActionable = (sessionId: RecoverySessionId, phase: string): SessionNotActionable => ({
  _tag: "SessionNotActionable",
  sessionId,
  phase,
});
