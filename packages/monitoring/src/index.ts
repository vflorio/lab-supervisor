// Published language del monitoring. Recovery ha il diritto di conoscere le facce, la salute
// confermata e la fotografia; non ha il diritto di conoscere le sonde, e infatti
// `HealthProbePort` non serve a nulla fuori da qui (§4.1, NO-3).

export type { Facet as FacetName } from "./domain/Facet";
export * as Facet from "./domain/Facet";
export * as FacetHealth from "./domain/FacetHealth";
export * as FacetRef from "./domain/FacetRef";
export * as FlappingPolicy from "./domain/FlappingPolicy";
export * as HealthSnapshot from "./domain/HealthSnapshot";
export * as HealthStatus from "./domain/HealthStatus";
export type { MonitoringEvent } from "./domain/MonitoringEvent";
export * as ProbeOutcome from "./domain/ProbeOutcome";
export * as FacetHealthRepository from "./ports/FacetHealthRepository";
export * as HealthProbePort from "./ports/HealthProbePort";
