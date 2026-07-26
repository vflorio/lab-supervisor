// -------------------------------------------------------------------------------------
// Model - Notifica generica, componibile con qualunque livello che abbia un ciclo di vita
// (recovery tripwires oggi, workflow/pipeline in futuro): "cosa dire" (channel/message),
// "dove" (target) e "quando" (policy = in quali momenti del ciclo di vita del chiamante
// va inviata). Console/log e SSE verso il web NON sono un target selezionabile qui: sono
// comportamento sempre-attivo del dispatcher (vedi ./dispatch.ts), indipendente da questo
// modello - solo Slack è un target opzionale, gated da config.slack.active.
// -------------------------------------------------------------------------------------

export type NotifyLifecycle = "immediate" | "exhausted";

export interface NotifyTarget {
  readonly type: "slack";
}

export interface NotifyRule {
  readonly type: NotifyTarget;
  readonly channel: string;
  readonly message: string;
  readonly policy: readonly NotifyLifecycle[];
}
