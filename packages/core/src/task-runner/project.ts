import {
  delayMsOf,
  detailOf,
  iterationOf,
  type LoopDescriptor,
  type LoopEntry,
  type LoopState,
  lastTickAtOf,
  nextTickAtOf,
  statusOf,
} from "./model";

// Unico punto in cui uno LoopState (ricco, interno) diventa una LoopEntry (il wire type verso
// la UI, vedi LoopFeed in ./stream.ts) - così ogni consumatore vede sempre la stessa proiezione.
export const project = (descriptor: LoopDescriptor, state: LoopState): LoopEntry => ({
  id: descriptor.id,
  label: descriptor.label,
  policyLabel: descriptor.policyLabel,
  status: statusOf(state),
  iteration: iterationOf(state),
  lastTickAt: lastTickAtOf(state),
  nextTickAt: nextTickAtOf(state),
  delayMs: delayMsOf(state),
  detail: detailOf(state),
});
