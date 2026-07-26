// -------------------------------------------------------------------------------------
// Model - Notifica generica, componibile con qualunque livello che abbia un ciclo di vita
// (recovery tripwires oggi, workflow/pipeline in futuro):
// "cosa dire" (channel/message), "dove" (target) e "quando"
// (policy = in quali momenti del ciclo di vita del chiamante va inviata).
// Console/log e SSE verso il web NON sono un target selezionabile qui:
// sono comportamento sempre-attivo del dispatcher, indipendente da questo modello;
// solo Slack è un target opzionale, gated da config.slack.active.
// -------------------------------------------------------------------------------------

export type NotifyLifecycle = "immediate" | "exhausted";

export interface NotifyTarget {
  readonly type: "slack";
}

// Contenuto del messaggio - oggi un solo case ("template": può contenere placeholder
// `{{key}}` risolti al momento del dispatch, es. `{{label}}`, `{{ip}}`, `{{id}}` del device coinvolto).
// Un ADT anche con un solo variante rende esplicito
// "questo va renderizzato" invece di trattare ogni string come se lo fosse implicitamente, e
// lascia spazio a un futuro secondo case (es. un messaggio statico) senza rompere l'interfaccia
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
