// La policy per un `DeviceKind`: quale faccia apre una sessione, quanto la si lascia stare
// prima di agire, con che scala si interviene, quando si notifica e quanto si aspetta dopo una
// resa. È il meccanismo con cui si dice "sorvegliato ma non curato": un kind senza profilo —
// oggi la TV — è monitorato e partecipa alla correlazione, ma non apre mai una sessione (NF-1).
// `correlation` è valorizzata solo per i kind che fanno da hub, cioè la CU.

import type { Duration } from "@lab/kernel/Duration";
import type { Facet } from "@lab/monitoring/domain/Facet";
import type { Capability } from "@lab/registry/domain/Capability";
import type { DeviceKind } from "@lab/registry/domain/DeviceKind";
import * as E from "fp-ts/Either";
import type * as O from "fp-ts/Option";
import type { CorrelationPolicy } from "./CorrelationPolicy";
import * as Errors from "./errors";
import type { Playbook } from "./Playbook";
import * as Remedy from "./Remedy";
import type { SupervisionWindow } from "./SupervisionWindow";

export type Criticality = "NotifyWhenExhausted" | "NotifyImmediately";

export type SupervisionProfile = {
  readonly kind: DeviceKind;
  readonly trigger: Facet;
  readonly gracePeriod: Duration;
  readonly playbook: Playbook;
  readonly criticality: Criticality;
  readonly cooldownAfterGiveUp: Duration;
  readonly window: SupervisionWindow;
  readonly correlation: O.Option<CorrelationPolicy>;
};

// Guardia precoce: si controlla il **soprainsieme** del kind, non l'istanza. Serve a rifiutare
// alla nascita un playbook assurdo (chiedere `AdbTcp` a una TV). Che quella singola CU sappia
// davvero riavviarsi è un'altra domanda, e ha un'altra risposta: `Unsupported` al dispaccio
// (FATTO-1, FL-2).
export const make = (
  draft: SupervisionProfile,
  capabilitiesOfKind: ReadonlySet<Capability>,
): E.Either<Errors.InvalidPlaybookForKind, SupervisionProfile> => {
  const missing = draft.playbook.steps
    .map((step) => Remedy.requiredCapability(step.remedy))
    .filter((capability) => !capabilitiesOfKind.has(capability));

  return missing.length === 0
    ? E.right(draft)
    : E.left(Errors.invalidPlaybookForKind(draft.kind, [...new Set(missing)]));
};
