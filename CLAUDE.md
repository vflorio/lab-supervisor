# Lab Supervisor — questo branch

Leggi `MODEL-PROMPT.md` prima di scrivere qualunque file: è la specifica completa (fatti del lab,
glossario, flussi, invarianti, architettura, criteri di rifiuto). `README.md` dà solo il contesto di
business. Dove i due divergono vince `MODEL-PROMPT.md`.

- `legacy/core/src/` è codice del progetto pre-DDD, **potato** a solo adapter tecnici e modelli puri
  (adb, Suitest, schedule, retry, state-machine). Sola lettura, mai da importare da `packages/`. Vedi
  `MODEL-PROMPT.md` §9 per la mappa di cosa atterra dove.
- `packages/kernel|registry|monitoring|recovery|hardware-control|alerting/` sono il modello, già
  scritto: `MODEL-PROMPT.md` resta la specifica con cui si giudica ogni modifica.
- `apps/supervisor/` è il composition root — configurazione, adapter montati, i due ticker, il
  ciclo di vita. NO-13 lo vietava *in quel giro*, non per sempre: è stato scritto dopo, su
  richiesta. Non contiene modello, e se una regola di dominio compare lì è nel posto sbagliato.
  Si avvia con `bun run --filter @lab/supervisor start` e legge `apps/supervisor/config/config.lab.jsonc`.

`bun run test:unit` (vitest per ogni package) e `bun run check-types` (`tsc --noEmit`) devono restare verdi.

## Documento vivo

`docs/anatomia.html` spiega il modello a schemi (context map, confine monitoring/recovery, macchina a
stati dell'aggregato, esagono). È pubblicato come artifact privato:

    https://claude.ai/code/artifact/3cb5f9f6-5c91-4ca5-9997-9796cef6c235

Per aggiornarlo si modifica `docs/anatomia.html` e lo si ripubblica **passando quell'URL**, altrimenti
si crea un artifact nuovo invece di aggiornare quello che le persone hanno già aperto.

I due blocchi `<!--stats:*-->` della pagina sono gli unici punti che citano una quantità e non si
scrivono a mano: `bun run docs:refresh` li riallinea al repository, `bun run docs:check` esce 1 se
sono disallineati. Se cambi il modello, l'invariante da rispettare è quella: gli schemi vanno
aggiornati insieme al codice, o il documento smette di essere una fonte e diventa un ricordo.
