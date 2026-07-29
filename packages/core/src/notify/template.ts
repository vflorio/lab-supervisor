// Sostituzione minimale di placeholder `{{key}}` con valori noti solo al momento del dispatch
// (es. entityId/label/ip del device coinvolto). Un placeholder senza corrispondenza in `vars`
// resta letterale invece di sparire: un messaggio mal configurato deve essere visibile, non
// silenziosamente vuoto.

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export const render = (template: string, vars: Readonly<Record<string, string>>): string =>
  template.replace(PLACEHOLDER, (match, key: string) => vars[key] ?? match);
