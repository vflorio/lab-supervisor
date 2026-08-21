# Lab Supervisor — questo branch

Leggi `MODEL-PROMPT.md` prima di scrivere qualunque file: è la specifica completa (fatti del lab,
glossario, flussi, invarianti, architettura, criteri di rifiuto). `README.md` dà solo il contesto di
business. Dove i due divergono vince `MODEL-PROMPT.md`.

- `legacy/core/src/` è codice del progetto pre-DDD, **potato** a solo adapter tecnici e modelli puri
  (adb, Suitest, schedule, retry, state-machine). Sola lettura, mai da importare da `packages/`. Vedi
  `MODEL-PROMPT.md` §9 per la mappa di cosa atterra dove.
- `packages/kernel|registry|monitoring|recovery|hardware-control|alerting/` sono scaffolding vuoto
  (`package.json` + `tsconfig.json`, zero sorgenti): è dove scrivi il modello.
- Non scrivere `apps/` in questo giro (`MODEL-PROMPT.md` NO-13).

`bun run test:unit` (vitest per ogni package) e `bun run check-types` (`tsc --noEmit`) devono restare verdi.
