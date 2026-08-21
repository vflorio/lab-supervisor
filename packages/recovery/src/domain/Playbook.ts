// La scala di escalation: ordinata, non vuota, e percorsa una sola volta in avanti (INV-4).
// Lo smart constructor custodisce il corollario di INV-6: l'ultimo gradino **deve** verificare
// la faccia d'innesco. Un playbook che finisce verificando un'altra faccia non potrebbe mai
// risolversi — arrivato in fondo avanzerebbe verso un gradino che non c'è — e questo è il posto
// più economico per accorgersene.

import { type Brand, brand } from "@lab/kernel";
import type { Facet } from "@lab/monitoring/domain/Facet";
import * as E from "fp-ts/Either";
import * as RA from "fp-ts/ReadonlyArray";
import type { ReadonlyNonEmptyArray } from "fp-ts/ReadonlyNonEmptyArray";
import * as RNEA from "fp-ts/ReadonlyNonEmptyArray";
import * as Errors from "./errors";
import type { RemedyStep } from "./RemedyStep";

// La posizione di un gradino nella scala, 0-based. Si muove solo in avanti (INV-4).
export type StepIndex = Brand<number, "StepIndex">;

export const stepIndex = (value: number): StepIndex => brand<StepIndex>(Math.max(0, Math.trunc(value)));

export const firstStep: StepIndex = stepIndex(0);

export const nextStep = (index: StepIndex): StepIndex => stepIndex(index + 1);

export type Playbook = { readonly steps: ReadonlyNonEmptyArray<RemedyStep> };

export const make = (
  steps: ReadonlyArray<RemedyStep>,
  trigger: Facet,
): E.Either<Errors.EmptyPlaybook | Errors.LastStepMustVerifyTrigger, Playbook> => {
  if (!RA.isNonEmpty(steps)) return E.left(Errors.emptyPlaybook);
  const last = RNEA.last(steps);
  return last.verification.facet === trigger
    ? E.right({ steps })
    : E.left(Errors.lastStepMustVerifyTrigger(trigger, last.verification.facet));
};

export const size = (playbook: Playbook): number => playbook.steps.length;

export const stepAt = (playbook: Playbook, index: StepIndex): RemedyStep | undefined => playbook.steps[index];

export const isExhausted = (playbook: Playbook, index: StepIndex): boolean => index >= playbook.steps.length;
