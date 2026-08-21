// Riferimento a una sessione di registrazione. Il registry non sa cosa sia una registrazione
// e non deve saperlo: gli serve solo per dire "questo device è in mano a qualcun altro
// finché non scade" dentro `Custody`.

import { type Brand, brand } from "@lab/kernel";

export type RecordingSessionId = Brand<string, "RecordingSessionId">;

export const of = (value: string): RecordingSessionId => brand<RecordingSessionId>(value);

export const value = (id: RecordingSessionId): string => id;
