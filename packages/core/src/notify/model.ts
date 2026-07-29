// Notifica generica, componibile con qualunque livello che abbia un ciclo di vita (recovery
// tripwires oggi, workflow/pipeline in futuro): "cosa dire" (channel/message), "dove" (target)
// e "quando" (policy). Console/log e SSE verso il web non sono un target selezionabile qui -
// sono comportamento sempre-attivo del dispatcher; solo Slack è opzionale, gated da config.slack.active.

export type NotifyLifecycle = "immediate" | "exhausted";

export interface NotifyTarget {
  readonly type: "slack";
}

// Contenuto del messaggio - oggi un solo case ("template", con placeholder `{{key}}` risolti
// al momento del dispatch). Un ADT anche con una sola variante rende esplicito "questo va
// renderizzato" e lascia spazio a un futuro secondo case senza rompere l'interfaccia.
export interface NotifyTemplateMessage {
  readonly type: "template";
  readonly message: string;
}

export interface NotifyRule {
  readonly type: NotifyTarget;
  readonly channel: string;
  readonly message: NotifyTemplateMessage;
  readonly policy: readonly NotifyLifecycle[];
}
