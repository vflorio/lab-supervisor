// Published language del kernel: qui dentro sta solo ciò che non appartiene a nessun
// contesto (A-1). Non `DeviceId`, che è del registry; non gli eventi concreti, che sono di
// chi li emette. Il kernel deve restare minuscolo, ed è un requisito, non uno stile.

export type { Brand, Unbrand } from "./Brand";
export { brand } from "./Brand";
export type { ClockEnv } from "./Clock";
export * as Clock from "./Clock";
export type { Decision } from "./Decider";
export * as Decider from "./Decider";
export type { DomainEvent } from "./DomainEvent";
export * as Duration from "./Duration";
export * as Instant from "./Instant";
