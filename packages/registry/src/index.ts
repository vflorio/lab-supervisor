// Published language del registry: `DeviceId`, i kind, le capability, la topologia e la
// custodia sono ciò che monitoring e recovery hanno il diritto di conoscere (A-1). L'aggregato
// e i suoi casi d'uso si esportano perché il composition root deve poterli montare; le porte
// perché sono contratti, non implementazioni.

export * as Attachment from "./domain/Attachment";
export type { Capability as CapabilityName } from "./domain/Capability";
export * as Capability from "./domain/Capability";
export * as ControlUnitType from "./domain/ControlUnitType";
export * as Custody from "./domain/Custody";
export * as Device from "./domain/Device";
export type { DeviceEvent } from "./domain/DeviceEvent";
export * as DeviceId from "./domain/DeviceId";
export * as DeviceKind from "./domain/DeviceKind";
export * as Endpoints from "./domain/Endpoints";
export * as Errors from "./domain/errors";
export * as RecordingSessionId from "./domain/RecordingSessionId";
export type { Relation } from "./domain/Relation";
export * as Topology from "./domain/Topology";
export * as DeviceRepository from "./ports/DeviceRepository";
