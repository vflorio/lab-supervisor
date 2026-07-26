// -------------------------------------------------------------------------------------
// Model - "cosa sta facendo l'entità in questo momento", una riga per (source, entityId):
// a differenza dei predicati (valori osservati) o delle notifiche (eventi puntuali),
// qui il valore interessante è lo STATO CORRENTE di ogni sottosistema
// che agisce su un'entità - da cui il ring buffer + "ultimo per chiave"
//
// `entityId` è quello nativo della fonte (nessuna canonicalizzazione sul registry in
// questa fase): la stessa entità fisica può comparire con entityId diversi tra fonti
// diverse finché una fase successiva non li unifica.
// -------------------------------------------------------------------------------------

export type ActivitySource = "recovery" | "adb";

export interface ActivityEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly entityId: string;
  readonly source: ActivitySource;
  // Riga leggibile (es. "pending", "running", "connected") - non strutturato in questa fase
  readonly status: string;
}

// Chiave univoca dell'"ultimo stato noto" per un sottosistema+entità, usata per indicizzare
// lo snapshot corrente (vedi ./stream.ts) - stesso schema di predicates/model.ts#factKey.
export const activityKey = (entry: Pick<ActivityEntry, "source" | "entityId">): string =>
  `${entry.source}:${entry.entityId}`;
