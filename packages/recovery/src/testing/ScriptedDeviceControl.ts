// Hardware finto. Registra ogni dispaccio — è così che uno scenario dimostra "zero comandi
// partiti" — e risponde con l'esito che gli è stato scritto, `Accepted` se non gli è stato detto
// nulla.
// `takes` fa avanzare l'orologio finto prima di rispondere: è il modo per mettere alla prova
// INV-10 senza aspettare davvero, perché un adapter lento nel lab vero è la norma e non
// l'eccezione (FATTO-12).

import type { Duration } from "@lab/kernel/Duration";
import type { Capability } from "@lab/registry/domain/Capability";
import type { DeviceId } from "@lab/registry/domain/DeviceId";
import * as TE from "fp-ts/TaskEither";
import type { Remedy } from "../domain/Remedy";
import * as Remedies from "../domain/Remedy";
import * as RemedyOutcome from "../domain/RemedyOutcome";
import type { DeviceControlPort } from "../ports/DeviceControlPort";

export type Dispatch = { readonly deviceId: DeviceId; readonly remedy: Remedy };

export interface ScriptedDeviceControl extends DeviceControlPort {
  readonly dispatched: () => ReadonlyArray<Dispatch>;
  readonly answer: (remedy: Remedy["_tag"], outcome: RemedyOutcome.RemedyOutcome) => void;
  readonly takes: (duration: Duration) => void;
}

export const make = (
  advanceClock: (by: Duration) => void = () => {},
  // Come un adapter vero: prima di provarci guarda se quel device dichiara la capability, e se non
  // la dichiara risponde `Unsupported` (FATTO-1, FL-2). Assente, si assume che possa tutto.
  capabilitiesOf: (deviceId: DeviceId) => ReadonlySet<Capability> | undefined = () => undefined,
): ScriptedDeviceControl => {
  const calls: Dispatch[] = [];
  const answers = new Map<string, RemedyOutcome.RemedyOutcome>();
  let latency: Duration | undefined;

  return {
    dispatched: () => [...calls],
    answer: (remedy, outcome) => {
      answers.set(remedy, outcome);
    },
    takes: (duration) => {
      latency = duration;
    },
    apply: (deviceId, remedy) =>
      TE.fromIO(() => {
        calls.push({ deviceId, remedy });
        if (latency !== undefined) advanceClock(latency);
        const declared = capabilitiesOf(deviceId);
        if (declared !== undefined && !declared.has(Remedies.requiredCapability(remedy)))
          return RemedyOutcome.unsupported;
        return answers.get(remedy._tag) ?? RemedyOutcome.accepted;
      }),
  };
};
