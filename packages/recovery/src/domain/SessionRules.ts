// INV-13: la parte di profilo che viene **congelata** dentro la sessione all'apertura.
// Playbook, faccia d'innesco, retry, cooldown, criticità e regola di quorum restano quelli con
// cui il recupero è cominciato: cambiare la configurazione a metà non deve alterare un recupero
// in corso, o il dossier racconterebbe una storia che non è successa.
// Restano **live**, cioè letti dal contesto a ogni tick, soltanto finestra e custodia: se una
// persona chiude la finestra o reclama il device, deve avere effetto immediato.

import type { Duration } from "@lab/kernel/Duration";
import type { Facet } from "@lab/monitoring/domain/Facet";
import type * as O from "fp-ts/Option";
import type { CorrelationPolicy } from "./CorrelationPolicy";
import * as CorrelationRule from "./CorrelationRule";
import type { Playbook } from "./Playbook";
import type { Criticality, SupervisionProfile } from "./SupervisionProfile";

export type SessionRules = {
  readonly trigger: Facet;
  readonly playbook: Playbook;
  readonly cooldownAfterGiveUp: Duration;
  readonly criticality: Criticality;
  readonly correlation: O.Option<CorrelationPolicy>;
};

export const freeze = (profile: SupervisionProfile): SessionRules => ({
  trigger: profile.trigger,
  playbook: profile.playbook,
  cooldownAfterGiveUp: profile.cooldownAfterGiveUp,
  criticality: profile.criticality,
  correlation: profile.correlation,
});

// La regola con cui si giudica se un cluster è ancora malato. Un bersaglio senza policy di
// correlazione non è un cluster, e `AllChildren` su zero dipendenti non incolpa nessuno.
export const correlationRule = (rules: SessionRules): CorrelationRule.CorrelationRule =>
  rules.correlation._tag === "Some" ? rules.correlation.value.rule : CorrelationRule.allChildren;
