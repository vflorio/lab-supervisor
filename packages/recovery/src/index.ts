// Published language di `@lab/recovery`, il bounded context core. Gli altri package non lo
// importano: sono `hardware-control` e `alerting` a dipendere da qui, perché le porte le definisce
// il consumatore e le implementano gli adapter. È la dipendenza invertita che tiene in piedi
// l'esagono (M-8).

export * as AbortRecovery from "./application/AbortRecovery";
export * as ConfigureSupervisionProfile from "./application/ConfigureSupervisionProfile";
export * as OpenRecoveryForConfirmedOutage from "./application/OpenRecoveryForConfirmedOutage";
export * as onFacetBecameUnhealthy from "./application/policies/onFacetBecameUnhealthy";
export * as onMaintenanceHoldPlaced from "./application/policies/onMaintenanceHoldPlaced";
export * as onRecoveryGivenUp from "./application/policies/onRecoveryGivenUp";
export * as onSupervisionWindowClosed from "./application/policies/onSupervisionWindowClosed";
export * as TickDueSessions from "./application/TickDueSessions";
export * as AbortReason from "./domain/AbortReason";
export * as AttemptRecord from "./domain/AttemptRecord";
export * as CorrelationPolicy from "./domain/CorrelationPolicy";
export * as CorrelationRule from "./domain/CorrelationRule";
export type { CorrelatedTarget, OutageSnapshot } from "./domain/correlateOutage";
export { correlateOutage } from "./domain/correlateOutage";
export * as Errors from "./domain/errors";
export * as GiveUpReason from "./domain/GiveUpReason";
export * as Incident from "./domain/Incident";
export { isTargetHealthy } from "./domain/isTargetHealthy";
export * as Playbook from "./domain/Playbook";
export type { RecoveryEvent } from "./domain/RecoveryEvent";
export * as RecoverySession from "./domain/RecoverySession";
export * as RecoverySessionId from "./domain/RecoverySessionId";
export * as RecoveryTarget from "./domain/RecoveryTarget";
export * as Remedy from "./domain/Remedy";
export * as RemedyOutcome from "./domain/RemedyOutcome";
export * as RemedyStep from "./domain/RemedyStep";
export * as RetryPolicy from "./domain/RetryPolicy";
export * as SessionRules from "./domain/SessionRules";
export * as SupervisionContext from "./domain/SupervisionContext";
export * as SupervisionProfile from "./domain/SupervisionProfile";
export * as SupervisionWindow from "./domain/SupervisionWindow";
export * as VerificationSpec from "./domain/VerificationSpec";
export * as DeviceControlPort from "./ports/DeviceControlPort";
export * as IdsPort from "./ports/IdsPort";
export * as NotificationPort from "./ports/NotificationPort";
export * as RecoverySessionRepository from "./ports/RecoverySessionRepository";
export * as SupervisionPort from "./ports/SupervisionPort";
export * as SupervisionProfileRepository from "./ports/SupervisionProfileRepository";
