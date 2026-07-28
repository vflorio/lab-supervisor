# Recovery pipeline: reboot loop e mancata riconnessione post-reboot

Analisi del TODO:

> Fix waitForDevice: gestire il caso in cui mDNS non rileva un device tornato online durante l'esecuzione del workflow

Indagine partita da lì, ma il problema reale è più ampio: non è solo `waitForDevice` a non
funzionare, è la combinazione di **quattro** meccanismi indipendenti nel motore di recovery che,
insieme, possono produrre reboot ripetuti di un device Android già tornato sano. Nessuno dei
quattro punti sotto è stato ancora corretto - questo documento è solo l'analisi.

---

## 1. `waitForDevice` aspetta su una porta ADB congelata

- [`apps/service/src/workflow.ts:89`](apps/service/src/workflow.ts#L89) → [`packages/core/src/services/adb.ts:184-189`](packages/core/src/services/adb.ts#L184-L189): `waitForDevice` è `adb -s <ip:porta> wait-for-device`. Non fa discovery, non riconnette nulla - aspetta solo che quel *serial* esatto (ip **e porta**) riappaia nella tabella dei transport locali di `adb`.
- Il target è risolto in [`apps/service/src/recovery/target.ts:19-38`](apps/service/src/recovery/target.ts#L19-L38) a partire dal registry statico di config: `"adb": [{"id": "192.168.1.4:5555", "target": "192.168.1.4:5555"}]` ([`config.home.jsonc:106`](apps/service/config/config.home.jsonc#L106)). `capabilitiesFor` ([`apps/service/src/recovery/capabilities.ts:27-41`](apps/service/src/recovery/capabilities.ts#L27-L41)) rilegge il registry "fresco" prima di ogni comando, ma non aiuta: quel valore è statico, non lo scrive mai nessuno dinamicamente durante un tentativo di recovery.
- Nota già presente in config, sulla riga subito sopra la chiamata incriminata:
  ```
  // FIXME va rivista, attende sulla 5555, mentre dopo un reboot è necessario il processo di connessione
  ["waitForDevice"],
  ```
  ([`config.home.jsonc:56-57`](apps/service/config/config.home.jsonc#L56-L57)) - non a caso il tripwire di livello 2 (reboot + waitForDevice) è commentato/disabilitato in config ([`config.home.jsonc:87-91`](apps/service/config/config.home.jsonc#L87-L91)).

> **IDEE**: Se la riconciliazione non interrompe la recovery, e sono entrambi in background, il device tornerebbe online sulla stessa porta (5555, persistente) dalla riconciliazione

### Il meccanismo "diverso" già esistente per questo problema

Esiste già uno stack FSM dedicato, wired e attivo (tick ogni 5s, log "Job: (AndroidBridge) reconcile"), pensato esattamente per la riconnessione post-reboot/post-disconnessione:

- `android-bridge` orchestrator ([`apps/service/src/machines/android-bridge/orchestrator.ts`](apps/service/src/machines/android-bridge/orchestrator.ts)): una FSM per camera (`Connecting/Idle/Disconnected`). Lo stato `Idle` porta con sé il `target: Network.Endpoint` **live**, aggiornato via mDNS/`target-resolution` a ogni riconnessione - gestisce esattamente il caso "reboot → nuova porta → re-pairing" ([`model.ts:15-21`](apps/service/src/machines/android-bridge/model.ts#L15-L21)).
- `acceptsCommands(cameraId)` / `snapshot()` ([`orchestrator.ts:104-118`](apps/service/src/machines/android-bridge/orchestrator.ts#L104-L118)) espongono lo stato corrente.
- Istanziato e ticked in [`service-lifecycle.ts:117,147`](apps/service/src/service-lifecycle.ts#L117), **ma non è mai passato** al motore di recovery ([`recovery/engine.ts`](apps/service/src/recovery/engine.ts)): le due parti del sistema, nate in momenti diversi, non si parlano.

**Fix proposto**: far leggere a `waitForDevice`/al resolve del target ADB lo stato dell'`AndroidBridge` (attendere `acceptsCommands(cameraId)`/stato `Idle`, che gestisce già mDNS + re-pairing) invece dello shell-out diretto su una porta congelata. Richiede passare l'`AndroidBridgeOrchestrator.Handle` nell'`Env` del motore di recovery.

> **IDEE**: forse questo problema si auto-risolve con gli altri spunti

---

## 2. Il retry riesegue l'INTERA pipeline da capo, incluso il reboot

Questo è il meccanismo che produce concretamente il "loop" osservato, indipendentemente dal punto 1.

- `runRecoveryFor` in [`entity-runner.ts:79-94`](packages/core/src/recovery/entity-runner.ts#L79-L94) avvolge `interpretPipeline(tripwire.pipeline)` in `Retry.retryingUntil(tripwire.retryPolicy, ...)`.
- `retryingUntil` ([`retry/interpret.ts:90-116`](packages/core/src/retry/interpret.ts#L90-L116)) non ritenta lo step fallito: ritenta l'intera `action` passata. Essendo un `TaskEither` (funzione lazy), ogni iterazione della `loop` richiama `interpretPipeline` **da zero**.
- Con la policy configurata (`[["constantDelay","10s"],["limitRetries",2]]`, [`config.home.jsonc:76`](apps/service/config/config.home.jsonc#L76)): se un tentativo non riporta il predicate a vero, 10s dopo la pipeline riparte **da `reboot`**, non da `waitForDevice`.

Sequenza concreta: `reboot` → `waitForDevice` (che magari si sblocca comunque, es. perché il device torna sulla stessa porta) → il predicate non è ancora tornato vero al momento del check → retry → **reboot di nuovo**, anche se il device nel frattempo si era già ripreso e stava solo aspettando che Suitest se ne accorgesse (vedi punto 3).


> **IDEE**: al posto di interrompere l'attività di recovery, se fosse gestito a livello di state machine il fatto di mettere in pausa/ripredere un workflow in caso di disconnessione (indipendentemente da chi lo lancia, ma in questo caso la recovery), possiamo prevedere policy con delays più alti per permettere al device di fare il reboot, il workflow va in pausa, la riconciliazione riporta il dispositivo in stato persistent (5555), quindi il waitForDevice successivo risolve correttemente;  ( se necessario in accoppiata a questo possiamo fare che il waitForDevice ha un timeout intrinseco preconfigurato)

---

## 3. Race fra retry-delay (10s) e polling Suitest (30s)

- Il check di successo ([`entity-runner.ts:86`](packages/core/src/recovery/entity-runner.ts#L86)): `recovered = ranOk && tripwire.predicate(lookup)`. `lookup` legge `factsByEntity`, popolato **solo** dal polling Suitest via [`predicates/tracker.ts:73-88`](packages/core/src/predicates/tracker.ts#L73-L88), che emette sullo stream solo i fatti effettivamente cambiati (diff-based, [`tracker.ts:32-55`](packages/core/src/predicates/tracker.ts#L32-L55)).
- Intervallo di polling per `suitest-camera`: **30s** (`"suitestCamera": {"polling": [["constantDelay","30s"]]}`, [`config.home.jsonc:19`](apps/service/config/config.home.jsonc#L19)).
- Il retry-delay della pipeline di recovery è **10s** - più corto del ciclo che dovrebbe confermarne il successo.

Anche se il reboot avesse funzionato perfettamente, al momento del check (10s dopo l'inizio del tentativo) è probabile che il predicate sia ancora quello "vecchio" (falso), perché Suitest non ha ancora ripollato. Il che fa scattare un retry (quindi un altro reboot, vedi punto 2) non necessario.

> **IDEE**: per ora lasciamo un commento inline nella config della policy con scritto espressamente che il retry deve essere > tracking.{domain}.polling
---

## 4. Nessun timeout su `Shell.run` + tick loop bloccante per le altre entità

- `Shell.run` ([`packages/core/src/shell.ts`](packages/core/src/shell.ts)) non ha alcun timeout: `CommandTimeoutError` è un tipo dichiarato ma mai costruito/usato in nessun punto del codebase.
- Se il device non torna davvero sulla porta congelata (punto 1, caso "mDNS non lo rileva" in senso stretto), `waitForDevice` non produce un loop: si blocca **per sempre** sul primo tentativo - il retry (punto 2) non scatta nemmeno, perché la promise non si risolve mai.
- `runner.ts` itera le entità in sequenza dentro un unico tick: `for (const entityId of factsByEntity.keys()) await observeEntity(entityId)` ([`runner.ts:99-101`](packages/core/src/recovery/runner.ts#L99-L101)), e `IntervalLoop.tick()` attende (`await onTick()`) il completamento dell'intero giro prima di pianificare il tick successivo ([`interval-loop.ts:40-58`](packages/core/src/interval-loop.ts#L40-L58)).
- Conseguenza: un'entità bloccata così **congela l'osservazione di tutte le altre entità della stessa policy di recovery**, non solo la propria.

**Fix da valutare (non implementato)**: aggiungere un timeout reale a `Shell.run` (usando `CommandTimeoutError`, già previsto ma inutilizzato), e/o isolare l'osservazione di ogni entità nel tick loop così che una si blocchi senza bloccare le altre.


---

## Rischio secondario: dispatch concorrenti per la stessa entità

Non confermato con la stessa certezza dei punti 1-4, ma strutturalmente possibile:

- `instance.state` in [`entity-runner.ts`](packages/core/src/recovery/entity-runner.ts) viene scritto solo **dopo** che l'intero `Machine.dispatch(...)` (transizione + esecuzione comando + eventuali eventi di follow-up) si è risolto - non c'è una scrittura ottimistica dello stato "recovering" prima di eseguire la pipeline.
- `observeEntity(entityId)` è invocato da due canali indipendenti e non coordinati fra loro: il tick periodico ([`runner.ts:96-103`](packages/core/src/recovery/runner.ts#L96-L103)) e la subscription sui nuovi fatti del predicate feed, quest'ultima fire-and-forget (`void observeEntity(...)`, [`runner.ts:87-94`](packages/core/src/recovery/runner.ts#L87-L94)).
- Se il predicate dell'entità "flappa" durante il reboot/riconnessione (plausibile: brevi blip di connettività rilevati da Suitest durante la riconnessione), ogni flip genera un nuovo fatto sullo stream, che rilancia `observeEntity` mentre il tentativo precedente è ancora in corso. Il reducer legge `instance.state` non ancora aggiornato (ancora "pending", non "recovering") e può ridispatchare un secondo `runRecovery` concorrente per la stessa entità.

Non necessario per spiegare il loop osservato (il punto 2 basta da solo), ma da tenere a mente se si interviene sul motore.

---

## Riepilogo priorità

| # | Problema | Certezza | Impatto |
|---|----------|----------|---------|
| 2 | Retry riesegue l'intera pipeline (reboot) da capo | Confermato, deterministico | Causa diretta del loop osservato |
| 3 | Retry-delay (10s) più corto del polling Suitest (30s) | Confermato | Genera retry/reboot non necessari |
| 1 | `waitForDevice` su porta ADB congelata, non usa mDNS/AndroidBridge | Confermato | Blocco quando la porta cambia davvero dopo reboot |
| 4 | Nessun timeout su Shell.run, tick loop bloccante | Confermato | Un device bloccato congela l'osservazione delle altre entità della policy |
| - | Dispatch concorrenti sulla stessa entità (predicate flapping) | Plausibile, non confermato con test | Possibile secondo reboot concorrente |

Nessuna modifica di codice è stata applicata: questo documento serve solo a fissare l'analisi
prima di decidere quali dei punti sopra affrontare e in che ordine.
