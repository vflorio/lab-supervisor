import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { ControlUnit } from "../suitest";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

// Identità = id Suitest: un control unit (CandyBox/Raspberry Pi) non ha esistenza indipendente
// da Suitest (a differenza di TV/Camera non può essere preconfigurato offline), quindi non serve
// una foreign key separata: `id` qui È l'id Suitest.
export const CandyboxEntryCodec = t.type({
  id: t.string,
  label: t.string,
  controlled: t.boolean,
});

export type CandyboxEntry = t.TypeOf<typeof CandyboxEntryCodec>;

export const CandyboxUpdateInputCodec = t.intersection([
  t.type({ id: t.string }),
  t.partial({ label: t.string, controlled: t.boolean }),
]);

export type CandyboxUpdateInput = t.TypeOf<typeof CandyboxUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - Control Units
// -------------------------------------------------------------------------------------

export const addCandybox =
  (entry: CandyboxEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    candyboxes: { ...registry.candyboxes, [entry.id]: entry },
  });

export const removeCandyboxById =
  (id: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [id]: _removed, ...controlUnits } = registry.candyboxes;
    return { ...registry, candyboxes: controlUnits };
  };

export const updateCandyboxById =
  (id: string, update: Partial<Omit<CandyboxEntry, "id">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.candyboxes[id];
    if (!existing) return registry;
    return { ...registry, candyboxes: { ...registry.candyboxes, [id]: { ...existing, ...update } } };
  };

export const findCandyboxById =
  (id: string) =>
  (registry: LabRegistry): CandyboxEntry | undefined =>
    registry.candyboxes[id];

export const controlledCandyboxIds = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.candyboxes)
    .filter((d) => d.controlled)
    .map((d) => d.id);

// Auto-import dalla sync Suitest: a differenza di TV/Camera l'identità coincide con quella
// Suitest, quindi non serve riconciliazione manuale via UI. Le entry esistenti mantengono
// label/controlled locali; i control unit nuovi vengono aggiunti con controlled:false.
export const upsertCandyboxesFromSuitestControlUnits =
  (controlUnits: readonly ControlUnit[]): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    candyboxes: {
      ...registry.candyboxes,
      ...Object.fromEntries(
        controlUnits.map((cu) => [
          cu.id,
          registry.candyboxes[cu.id] ?? { id: cu.id, label: cu.name, controlled: false },
        ]),
      ),
    },
  });
