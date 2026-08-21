// Il kit con cui si mette alla prova il notifier, e con cui si monta il supervisore senza un canale
// Slack a cui parlare. Entrypoint separato da `index.ts` (A-2): un finto non deve poter finire in
// produzione per distrazione di un import.

export * as RecordingSlack from "./RecordingSlack";
