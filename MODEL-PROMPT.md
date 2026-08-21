# Prompt: genera il modello DDD del Lab Supervisor

> **Per il revisore umano.** Ogni requisito è numerato (`FATTO-n`, `FL-n`, `INV-n`, `A-n`, `M-n`, `S-n`, `NO-n`)
> perché tu possa cassarlo, cambiarlo o annotarlo singolarmente. Le sezioni §1–§4 sono *vincoli*: descrivono
> il lab e le regole, e l'AI non può negoziarle. Le §5–§6 sono *prescrizioni di forma*: dicono come e dove
> scrivere. La §7 è la definizione di "fatto". La §8 è ciò che fa rifiutare la consegna.
>
> Consegna questo file da solo, in una sessione pulita, insieme a `README.md`. Non aggiungere chiarimenti a voce:
> se qualcosa qui è ambiguo è un bug di questo documento, e va corretto qui.

> **Nota sul branch (`model/ddd-v2`).** Il giro precedente è andato alla deriva progressivamente, non al primo
> colpo: ogni sessione successiva vedeva più codice — inclusi gli stub sbagliati del giro prima — e ne
> assorbiva le opinioni invece di ripartire dai fatti. Questo branch esiste per togliere quell'innesco.
> Parte da `main` (il progetto pre-DDD, funzionante) e ne tiene **solo** ciò che non ha un'opinione sul
> dominio: adapter tecnici (client adb, client Suitest, mDNS, Slack) e modelli puri (`schedule/`, `retry/`,
> `state-machine/`), spostati in sola lettura sotto `legacy/core/src/` (§9). Fuori tutto il resto: la vecchia
> UI, il vecchio motore di recovery/workflow, l'app Android, la dashboard, le persistenze — sia perché fuori
> scope in questo giro (§9, NO-13…NO-17), sia perché un modello vecchio letto per sbaglio come modello nuovo
> è esattamente il meccanismo che ha prodotto la deriva. `packages/kernel|registry|monitoring|recovery|
> hardware-control|alerting/` esistono già come scaffolding — `package.json` + `tsconfig.json`, **zero**
> file sorgente — per fissare la topologia delle dipendenze (§5 A-1) senza lasciare nulla da imitare o
> correggere. Se devi ripetere questo giro, riparti da qui (`git switch model/ddd-v2` o ricrea il branch
> dallo stesso `main`), non dal branch su cui la generazione precedente ha scritto: quel branch, una volta
> scritto, ha esattamente lo stesso problema di `legacy/core/src/recovery` — un modello che sembra autorevole
> solo perché è già lì.

---

## §0 · Istruzioni operative

**Ruolo.** Sei un architetto software che conosce Domain-Driven Design tattico e strategico, fp-ts, e sa
resistere alla tentazione di scrivere codice prima di aver nominato le cose. Lavori su un monorepo TypeScript
esistente (bun + turbo + vitest + biome, fp-ts 2.16, io-ts, ts-pattern).

**Compito.** Produrre il modello di dominio completo del Lab Supervisor: `domain/`, `application/`, `ports/`
e `testing/` dei bounded context, più gli scenari di accettazione, tutto verde e tutto eseguibile **senza
hardware, senza rete e senza l'orologio di sistema**.

**Consegna in un colpo solo.** Scrivi i file nel repository e chiudi con un report finale (§8.3). Non
chiedere conferme intermedie, non consegnare a rate, non lasciare `TODO` nel core: se un punto ti sembra
sottospecificato, prendi la decisione più conservativa, implementala, e **elencala nel report** sotto
"assunzioni". Il costo di una assunzione sbagliata è una riga di revisione; il costo di un giro di
chiarimenti è la qualità di tutto il resto.

**Cosa leggere.** Questo documento e `README.md` (il ticket originale, che dà il contesto di business) sono
**necessari e sufficienti**: dove i due divergono, vince questo documento, più recente e già passato per un
giro di modellazione e revisione. `legacy/core/src/` è materiale di **consultazione facoltativa** (§9): lo
apri solo se un fatto della §1 ti sembra sottospecificato e vuoi la fonte primaria, mai per copiarne la
forma. Parti da un albero di lavoro pulito.

**Ordine di lavoro imposto.** Ogni gradino chiude con `bun run test` e `bunx tsc --noEmit` verdi prima del
successivo. Non saltare avanti: la maggior parte delle derive nasce dallo scrivere l'application layer
prima che il dominio sappia decidere.

1. `@lab/kernel` — `Brand`, `Instant`, `Duration`, `DomainEvent`, `Decider`, `Clock` + `FakeClock`.
2. `@lab/registry` — value object, aggregato `Device`, `Topology`, `Custody`, porta e fake.
3. `@lab/monitoring` — `Facet`, `FacetHealth`, anti-flapping, `HealthSnapshot`, porte e fake.
4. `@lab/recovery` / `domain/` — i value object, poi `correlateOutage`, poi `RecoverySession` con le sue
   invarianti e un test per ciascuna.
5. `@lab/recovery` / `ports/` + `testing/` — porte e adapter finti.
6. `@lab/recovery` / `application/` — use case e policy.
7. `test/scenarios/` — gli scenari S1–S22 della §7.

**Regole anti-deriva.** Sono la ragione per cui questo documento esiste. Violarne una è un difetto di
consegna, non un'opinione.

- **Glossario chiuso (§2).** Ogni tipo esportato dal dominio deve avere un nome che compare in questo
  documento. Se ti serve un concetto che non c'è, significa che il documento è incompleto: implementalo con
  il nome che ti sembra giusto e **segnalalo nel report**, non seppellirlo.
- **Niente invenzioni sul lab.** I fatti della §1 sono verificati sul campo. Non inventare campi dell'API
  Suitest, comandi adb, stati o relazioni che non sono elencati lì.
- **Niente feature non richieste.** Non aggiungere dashboard, read model, event sourcing, code di lavoro,
  retry di trasporto, circuit breaker, metriche, logging strutturato, telemetria.
- **Il dominio è puro e sincrono.** In `domain/` non esistono `Promise`, `Task`, `TaskEither`, `Date.now()`,
  `Math.random()`, I/O, né import da `application/`, da `ports/` o da qualunque package adapter. `Either` sì:
  è un valore, non un effetto.
- **Un file, un concetto.** Niente `utils.ts`, `helpers.ts`, `types.ts`, `common/`, `shared/` dentro
  `domain/`. Niente suffissi tecnici (`.dto`, `.impl`, `.service`, `.entity`, prefisso `I`).
- **Budget.** ~250 righe per file: oltre, il file diventa una cartella omonima con un `index.ts` che
  ri-esporta (gli import esterni non cambiano). Attesi ~20 file in `recovery/domain`, ~10 in
  `registry/domain`, ~8 in `monitoring/domain`. Se ne stai scrivendo il doppio, ti sei perso.
- **`packages/*/src` è vuota di proposito.** Non è uno stub da rispettare né un'ipotesi altrui da correggere:
  è scaffolding pulito (solo `package.json` + `tsconfig.json`), pensato così perché un giro precedente aveva
  lasciato lì un modello sbagliato e quello ha influenzato il giro successivo più di questo stesso documento.
  Scrivi come se il package non fosse mai esistito. `legacy/core/src/` è il progetto pre-DDD **potato**: solo
  adapter tecnici e modelli puri, in sola lettura, mai da importare (§9).

---

## §1 · Il lab: fatti verificati

Questi fatti vengono dall'hardware reale e dal codice del servizio già in produzione. Sono la parte che il
`README.md` non dice e che, mancando, ha prodotto un modello sbagliato al giro precedente.

### La gerarchia

```
ControlUnit (CU)  ──DependsOn──▶  fino a 4 TV
                                        ▲
AndroidCamera  ────Observes────────────┘   (la camera INQUADRA la TV: non ne dipende)
```

- **FATTO-1** — Una **ControlUnit** è il ponte IR che pilota le TV. Suitest ne distingue quattro tipi:
  `candybox` (Raspberry Pi, il caso comune), `drive`, `personal-pi`, `solo-candy`. Il campo `reboot` e il
  campo `shutdown` dell'API sono **per singola unità**: non tutte le CU si riavviano. (note dello sviluppatore: nel lab abbiamo solo Raspberry PIs, e non vogliamo usare altro)
- **FATTO-2** — Una **TV** dipende da **esattamente una** CU. Una CU pilota **al massimo 4 TV** (limite
  fisico delle porte). L'API Suitest espone `controlUnitIds` come array, ma è un artefatto dell'API: nel
  nostro lab la relazione è 1-a-molti, e il modello deve imporlo.
- **FATTO-3** — Una **AndroidCamera** è un telefono/tablet Android che esegue l'app di cattura
  (`suitest-camera` + Automation) e inquadra una TV. È **assegnata** a una TV (`assignedDeviceId` lato
  Suitest), ma **non ne dipende**: sta sul wifi e su adb, e sopravvive benissimo a una TV spenta o a una CU
  morta. Riavviare la CU non ripara mai una camera.
- **FATTO-4** — Se una CU cade, le TV che pilota risultano irraggiungibili **di conseguenza**: è un guasto
  solo, non cinque.
- **FATTO-5** — Nel lab esistono anche smart plug. Il servizio **non deve poterli comandare**, per nessuna
  ragione, nemmeno per errore, nemmeno passando da Suitest.

### Come si osserva (verità di lettura)

- **FATTO-6** — CU: Suitest espone `online: boolean` per unità. È la sola faccia osservabile della CU.
- **FATTO-7** — TV: Suitest espone uno `status` per device. È la sola faccia osservabile della TV **oggi**.
- **FATTO-8** — AndroidCamera: **due facce indipendenti**, ed è il punto in cui il giro precedente ha
  perso informazione.
  1. *transport adb* — l'host `host:porta` risponde (o `adb devices` lo riporta connesso);
  2. *stream* — Suitest riporta `streamActive` (e `online`) per il video-capture-device associato.
  Le due cadono separatamente: un transport adb "incastrato" (`adb devices` lo mostra ma non risponde più)
  con lo stream ancora attivo, o uno stream morto con adb perfettamente vivo (app piantata). La faccia che
  interessa al business è lo **stream**; l'altra serve a scegliere il rimedio e a scrivere una diagnosi
  sensata su Slack.
- **FATTO-9** — L'identità di una camera è locale e stabile; il riferimento Suitest
  (`videoCaptureDeviceId`) e l'endpoint adb sono **chiavi esterne opzionali**, riconciliate a mano. Una
  camera può esistere in anagrafica senza l'uno o senza l'altro.

### Come si comanda (verità di scrittura)

- **FATTO-10** — CU e TV si comandano **solo** attraverso la Private API di Suitest: power on, power off,
  reboot. La Public API non espone queste operazioni.
- **FATTO-11** — Le camere si comandano **solo** via **adb over TCP**. Il device espone adb su una porta
  prefissata dopo il boot. I rimedi disponibili sono: riconnettere il transport, riavviare l'app di
  cattura, riavviare il device, rieseguire la sequenza di avvio post-boot (lancio app, profilo
  `experimental-wide`, tap sul connect alle coordinate giuste, tenendo conto dell'orientamento).
- **FATTO-12** — La sequenza post-boot è **lenta** (minuti) e storicamente inaffidabile: mDNS a volte non
  rileva un device tornato online, e i transport adb si incastrano. Qualunque chiamata verso adb può
  restare appesa.
- **FATTO-13** — Un reboot appena impartito **non spegne il device all'istante**: per qualche secondo il
  device continua a rispondere, e `streamActive` lato Suitest resta vero ancora più a lungo. Una verifica
  ingenua subito dopo il comando dichiara guarito un device che si sta ancora spegnendo. È il difetto che
  il modello deve rendere **impossibile**, non improbabile.

### Vincoli operativi

- **FATTO-14** — Si agisce solo dentro una finestra configurabile (es. Lun–Ven 09:00–18:00): non è "orario
  di lavoro", è un'**autorizzazione**. Fuori non parte nessun comando, così nessun device si accende di notte.
- **FATTO-15** — Uno spegnimento manuale fatto da un operatore per manutenzione **non va mai scavalcato**.
- **FATTO-16** — Slack si notifica solo a rimedi esauriti, oppure subito se il profilo dichiara criticità
  immediata. Con abbastanza diagnosi da evitare che qualcuno debba aprire i log.
- **FATTO-17** — L'health-check del processo (PM2/Docker) è infrastruttura: **fuori dal modello**, per scelta.

---

## §2 · Glossario chiuso (ubiquitous language)

Ogni nome qui sotto è vincolante: è il nome del tipo, del file e della parola che si usa parlando. Non
coniare sinonimi, non tradurre in inglese diverso, non abbreviare.

| Nome | Contesto | Cos'è |
|---|---|---|
| `DeviceId` | registry | Identità di un device, condivisa fra tutti i contesti |
| `DeviceKind` | registry | `"ControlUnit" \| "Tv" \| "AndroidCamera"` — **niente smart plug** |
| `ControlUnitType` | registry | `"candybox" \| "drive" \| "personal-pi" \| "solo-candy"` |
| `Capability` | registry | Cosa quel device *sa* fare: `PowerOn`, `RebootHardware`, `AppControl`, `AdbTcp` |
| `Endpoints` | registry | Dove lo si raggiunge. Dato **opaco**: il dominio lo passa, non lo interpreta |
| `Attachment` | registry | L'arco verso il genitore: `{ parent, relation }` |
| `Relation` | registry | `"DependsOn" \| "Observes"` — l'unica distinzione che salva dal riavviare la CU sbagliata |
| `Device` | registry | L'aggregato di anagrafica |
| `Topology` | registry | Proiezione padre/figli ricalcolabile, interrogabile per relazione |
| `Custody` | registry | Chi ha il diritto di comandare quel device **adesso** |
| `Facet` | monitoring | Una faccia osservabile: `Reachable`, `AdbTransport`, `StreamAvailable` |
| `FacetRef` | monitoring | `{ deviceId, facet }` — l'identità di ciò che si sonda |
| `ProbeOutcome` | monitoring | Esito grezzo di una sonda, già tradotto in lingua di dominio |
| `HealthStatus` | monitoring | `Unknown \| Healthy{since} \| Unhealthy{since}` — **confermato**, post anti-flapping |
| `FlappingPolicy` | monitoring | Quante osservazioni concordi servono per cambiare stato |
| `FacetHealth` | monitoring | L'aggregato: una faccia di un device e la sua storia recente |
| `HealthSnapshot` | monitoring | Fotografia immutabile di più `FacetHealth`, interrogabile |
| `RecoveryTarget` | recovery | Su cosa si apre una sessione: un device, o una CU con i suoi dipendenti |
| `Remedy` | recovery | L'azione di dominio (`RestartApp`, non `adb shell am force-stop`) |
| `RemedyOutcome` | recovery | Esito del *dispaccio*, mai della guarigione |
| `RemedyStep` | recovery | Un gradino: rimedio + precondizione + verifica + retry |
| `Playbook` | recovery | La scala di escalation, ordinata, non vuota |
| `RetryPolicy` / `Backoff` | recovery | Quanti tentativi e con che attesa |
| `VerificationSpec` | recovery | Come si accerta la guarigione: faccia, assestamento, cadenza, scadenza |
| `SupervisionWindow` | recovery | La finestra di autorizzazione |
| `SupervisionProfile` | recovery | La policy per un `DeviceKind` |
| `SessionRules` | recovery | La parte di profilo **congelata** dentro la sessione |
| `SupervisionContext` | recovery | Il mondo già risolto che il tick consegna all'aggregato |
| `CorrelationRule` / `CorrelationPolicy` | recovery | Quando più figli giù diventano colpa della CU |
| `correlateOutage` | recovery | Il domain service che sceglie i bersagli veri |
| `RecoverySession` | recovery | L'aggregato: la macchina a stati del recupero |
| `AttemptRecord` | recovery | Una riga del dossier |
| `AbortReason` / `GiveUpReason` | recovery | Perché ci si è fermati |
| `Incident` | recovery | L'output di business: la resa, con il dossier |

---

## §3 · I flussi di recovery

Sono quattro, e sono **tutto** l'ambito. Il modello si giudica su questi.

### FL-1 · Camera Android senza stream (adb)

- **Innesco**: la faccia `StreamAvailable` della camera è `Unhealthy` da almeno **3 minuti** (grace).
- **Scala** (ordine vincolante — è l'escalation):

  | # | Rimedio | Si applica se | Verifica | Assestamento / scadenza | Tentativi |
  |---|---|---|---|---|---|
  | 1 | `ReconnectTransport` | `AdbTransport` è `Unhealthy` | `AdbTransport` | 5s / 30s | 1 |
  | 2 | `RestartApp(suitest-camera)` | sempre | `StreamAvailable` | 10s / 60s | 2, fisso 30s |
  | 3 | `RebootHardware` | sempre | `StreamAvailable` | 90s / 3 min | 1 |
  | 4 | `RelaunchSuite` | `AdbTransport` è `Healthy` | `StreamAvailable` | 15s / 60s | 1 |

- **Note.** Lo step 1 verifica una faccia **diversa** da quella d'innesco: se il transport torna ma lo
  stream no, il rimedio ha fatto il suo lavoro e la sessione **sale di gradino senza consumare tentativi**
  (regola in INV-6). Lo step 4 esiste per il caso "il device è tornato su ma l'app di cattura non è
  ripartita": la sequenza post-boot completa è responsabilità dell'ACL, non un altro gradino.
- **Fine**: scala esaurita ⇒ `Incident` con il dossier completo (tentativi, esiti, ultima fotografia di
  **tutte** le facce dei device coinvolti).

### FL-2 · ControlUnit irraggiungibile

- **Innesco**: la faccia `Reachable` della CU è `Unhealthy` da almeno **1 minuto**.
- **Scala**: un solo gradino, `RebootHardware` via Suitest — verifica `Reachable`, assestamento 45s,
  scadenza 3 min, 2 tentativi con backoff fisso di 1 minuto.
- **Nota**: `PowerOn` **non** entra nel playbook della CU. Una CU spenta non ha accensione fuori banda che
  ci sia lecito usare (gli smart plug sono vietati, FATTO-5): se il reboot Suitest non è accettato, l'esito
  è `Unreachable`, si esaurisce la scala e serve una mano umana. È il comportamento corretto, non una lacuna.
- **Capability**: se la CU non dichiara `RebootHardware` (FATTO-1), il dispaccio torna `Unsupported` e la
  sessione si arrende **subito, senza ritentare**: ritentare una cosa che quel device non saprà mai fare è
  solo rumore.

### FL-3 · Ibrido: i figli di una CU cadono insieme

Il flusso che il giro precedente aveva capito a metà.

- **Innesco**: fra i figli `DependsOn` **correlabili** di una CU, abbastanza sono giù da incolpare la CU.
  "Correlabili" = monitorati, supervisionati, senza custodia esterna: una TV sotto maintenance hold o
  esclusa dal monitoraggio **non entra né al numeratore né al denominatore** (INV-11).
- **Regola** (`CorrelationRule`): `AllChildren` (predefinita, ed è ciò che serve al lab: *tutti* i device di
  quella CU giù ⇒ è la CU), oppure `MinChildren(n)`, oppure `Fraction(f)`.
- **Sussunzione**: se è la **CU stessa** a essere `Unhealthy`, la regola non si applica affatto — i figli
  sono danno collaterale (FATTO-4) e il bersaglio è la CU comunque. Non si aprono mai sessioni sui figli in
  quel caso.
- **Da quando**: l'outage del cluster comincia **quando il quorum è stato raggiunto**, cioè al più tardo
  fra gli inizi di outage dei figli necessari a soddisfare la regola — non al primo che è caduto. Da lì
  decorre il grace del cluster (`CorrelationPolicy.gracePeriod`, predefinito 1 minuto).
- **Niente finestra temporale.** Non si richiede che i figli cadano "entro 30 secondi l'uno dall'altro": un
  device ancora giù è ancora giù, e la parentela conta più della coincidenza. Questa è una **decisione
  presa**, da annotare nel commento di `correlateOutage`, non da rimettere in discussione.
- **Rimedio**: lo stesso playbook della CU (FL-2). Il bersaglio su cui si agisce è la CU.
- **Verifica** — il punto in cui il giro precedente sbagliava: non basta che la CU risponda. Il cluster è
  guarito quando la CU è sana **e** la regola di correlazione **non incolpa più** la CU, cioè abbastanza
  dipendenti sono tornati sani (INV-8). Se la CU torna e le TV no, la sessione **non** è risolta: sale, si
  esaurisce, e alza un incidente. Che è esattamente ciò che deve succedere.
- **Una sessione e un incidente**, mai tre. E se una TV aveva già una sessione sua aperta prima che il
  quorum si formasse, quella sessione viene **assorbita** (INV-1).

### FL-4 · TV con container HTML + CDP — *da NON implementare*

Il flusso arriverà: la TV eseguirà un nostro container HTML pilotato via Chrome DevTools Protocol. In questo
giro **non si scrive una riga** per farlo. Il modello però deve reggerlo senza riaperture del core, e la
consegna deve **dimostrarlo a parole** (§8.3): dieci righe che elencano cosa esattamente si aggiungerà —
`Facet` `ContainerAlive`, `Remedy` `ReloadContainer`, `Capability` `CdpControl`, un campo `cdp` in
`Endpoints`, un adapter e un `SupervisionProfile` per il kind `Tv` — e perché `RecoverySession`,
`Playbook`, `correlateOutage` e le porte **non** cambieranno.

Due conseguenze che invece vanno rispettate **da subito**, perché costano nulla adesso e molto dopo:

- **A-Ext-1** — `Endpoints` è un **record di endpoint opzionali**, non una union: una camera ha bisogno
  *insieme* dell'endpoint adb (per comandare) e del riferimento Suitest (per osservare lo stream). Domani la
  TV ne avrà tre.
- **A-Ext-2** — Lo smistamento dell'ACL non può dipendere dal solo `DeviceKind`: la TV avrà rimedi Suitest
  (power, reboot) **e** rimedi CDP. La firma dell'adapter di routing deve smistare su
  `(kind, remedy)` o sull'endpoint disponibile. In questo giro la scrivi solo come firma, non come codice.

### FL-5 · I non-flussi (verifiche in negativo)

- **NF-1** — Una TV giù **da sola** non ha recovery: è monitorata e partecipa alla correlazione, ma non
  esiste un `SupervisionProfile` per il kind `Tv`. L'apertura restituisce `NoProfile` e non succede nulla.
  Questo è il meccanismo con cui si dice "sorvegliato ma non curato": non serve altro.
- **NF-2** — Tre camere giù, appese via `Observes` a tre TV della stessa CU, **non** devono mai produrre un
  reboot della CU (FATTO-3). Tre bersagli `Device`, punto.
- **NF-3** — Gli smart plug non sono esprimibili: nessun `DeviceKind`, nessuna `Capability`, nessun
  `Remedy`, nessuna porta. Il divieto è una proprietà della forma del modello, non un `if`.

---

## §4 · Le invarianti

Sono la parte che distingue un modello da un insieme di tipi. Per **ognuna** deve esistere un test che la
dimostra, e nel commento di testa del file che la custodisce deve comparire il suo numero.

- **INV-1 · Una sola sessione attiva per device coinvolto.** Non "per target": per *device*. Due bersagli
  diversi che condividono un device (`Device(tv-a)` e `ControlUnitCluster(cu, [tv-a, tv-b])`) non possono
  avere sessioni attive insieme — è proprio il caso che FL-3 esiste per evitare. Nessun aggregato vede i
  propri fratelli, quindi la fa rispettare l'application layer con una domanda al repository
  (`findBlockingFor`), non un `if` sparso. Quando un bersaglio cluster assorbe device che avevano già una
  sessione, quelle sessioni vengono **abortite con `Superseded(bySessionId)`** prima di aprire la nuova.
- **INV-2 · `attempts ≤ retry.maxAttempts`, per ogni gradino.** Un solo punto nel codice incrementa un
  tentativo.
- **INV-3 · Nessun rimedio dispacciato fuori dalla finestra o senza custodia del supervisore.** Reso
  strutturale: solo le transizioni innescate da `Tick` possono dispacciare, e `Tick` è l'unico comando che
  porta con sé il `SupervisionContext`. Una transizione senza contesto non *può* dispacciare, non "si
  ricorda di non farlo".
- **INV-4 · Escalation monotona.** L'indice di gradino si muove solo in avanti. Anche gli scarti per
  precondizione non soddisfatta vanno avanti, mai indietro.
- **INV-5 · `Resolved` si raggiunge solo da `Verifying`, e solo con una guarigione *successiva al rimedio*.**
  Non basta che la faccia risulti `Healthy`: il suo `since` deve essere **posteriore all'istante di
  dispaccio**. È la traduzione strutturale del FATTO-13 — uno stato sano ereditato da prima del comando non
  è una guarigione, è una lettura stantia. Una sola transizione in tutto il file produce `Resolved`.
- **INV-6 · Verifica su faccia non-innescante ⇒ si avanza, non si risolve.** Se il gradino verifica una
  faccia diversa da quella d'innesco (FL-1 step 1) e quella verifica passa, la sessione passa al gradino
  successivo **senza consumare tentativi** e senza risolversi. Corollario strutturale: **l'ultimo gradino
  di un playbook deve verificare la faccia d'innesco**, e lo smart constructor di `Playbook` rifiuta i
  playbook che non lo fanno.
- **INV-7 · Un bersaglio già guarito non riceve rimedi.** Al `Tick`, se il bersaglio risulta sano nel
  `SupervisionContext` mentre la sessione è in `AwaitingGrace` o `BackingOff`, la sessione si chiude come
  `Aborted(SelfHealed)` e **nessun comando parte**. Una CU che sfarfalla trenta secondi non si prende un
  reboot al minuto uno. Nota di design: il controllo sta nel punto — e solo nel punto — in cui sta per
  partire un comando; non serve una policy che insegua gli eventi di guarigione.
- **INV-8 · Un cluster è guarito solo se lo sono i suoi.** Il verdetto per un `ControlUnitCluster` è:
  la CU è sana **e** la `CorrelationRule` non la incolpa più, valutata sui membri della sessione. "La CU
  risponde al ping" non è mai, da solo, una guarigione. La **stessa funzione pura** calcola questo verdetto,
  il controllo di INV-7 e la correlazione: se ne stai scrivendo tre versioni, il modello ti sta dicendo che
  ne basta una.
- **INV-9 · Da `GivenUp` non si esce, e non si riprova subito.** La fase è terminale e assorbe ogni comando.
  In più la resa fissa un `retryNotBefore = at + cooldownAfterGiveUp` (congelato all'apertura, INV-13) che
  **blocca l'apertura di nuove sessioni** sugli stessi device finché non è passato. Senza questo, un device
  rotto viene riavviato e notificato a ogni ciclo di monitoraggio. Vale anche per le sessioni abortite da un
  maintenance hold: non si riaprono a raffica, si aspetta che il hold sia rimosso.
- **INV-10 · `Executing` ha una scadenza.** Se l'esito del rimedio non arriva entro
  `RemedyStep.dispatchTimeout`, la sessione emette `RemedyTimedOut` e tratta il tentativo come fallito.
  Discende dal FATTO-12: una chiamata adb può restare appesa per sempre, e una sessione che aspetta per
  sempre non chiede più tick e sparisce dai radar senza mai alzare un incidente.
- **INV-11 · La correlazione attraversa solo archi `DependsOn`, e solo figli correlabili.** Mai `Observes`
  (FATTO-3, NF-2). Numeratore e denominatore contano gli stessi figli: monitorati, supervisionati, senza
  custodia esterna. Un figlio sotto maintenance hold non fa scattare né impedisce una correlazione: esce
  dal conto.
- **INV-12 · L'anagrafica non accetta topologie impossibili.** Una TV si attacca `DependsOn` a una sola CU;
  una camera si attacca `Observes` a una sola TV; una CU non ha genitore; una CU ha al massimo **4** figli
  `DependsOn` (FATTO-2). Il vincolo sul numero di figli, come INV-1, non è verificabile dall'aggregato:
  vive nel caso d'uso che attacca, e restituisce un errore di dominio.
- **INV-13 · La sessione finisce con le regole con cui è iniziata.** All'apertura si congela un
  `SessionRules` — playbook, faccia d'innesco, retry, cooldown, criticità, regola di quorum. Restano
  **live** (letti dal contesto a ogni tick) solo finestra e custodia: se un umano chiude la finestra o
  reclama il device a metà recupero, deve avere effetto immediato. Tutto il resto è congelato: cambiare la
  configurazione non deve alterare un recupero in corso.

### §4.1 · Il confine che regge tutto

Il monitoring risponde a **una sola domanda fattuale**: "questa faccia risponde?". Non conosce grace period,
non conosce criticità, non emette mai un evento tipo `RecoveryNeeded` — significherebbe che sta decidendo al
posto del core. Recovery decide **quando** un fatto diventa un problema di business, perché è una policy
configurabile per tipo di device.

Corollario operativo che vale la pena scrivere una volta e non dimenticare: **la verifica di un rimedio
legge la salute confermata dal monitoring**, non esegue sonde proprie. Recovery non possiede sonde e non
importa `HealthProbePort`. Tre vantaggi in un colpo: l'anti-flapping vale anche per la verifica (non si
dichiara guarito un device su un ping fortunato), non esistono due verità sulla salute, e la sessione resta
pura perché il contesto le porta la fotografia già pronta.

---

## §5 · Architettura imposta

Questa parte è validata: non ridiscuterla, applicala.

- **A-1 · Un package per bounded context**, e la context map È il grafo delle dipendenze dichiarate nei
  `package.json`. Un confine violato è un errore di build, non una questione di disciplina.

  ```
  packages/kernel/            shared kernel — deve restare MINUSCOLO
  packages/registry/          BC supporting (upstream, Open Host Service)
  packages/monitoring/        BC supporting
  packages/recovery/          BC CORE  ⟵ qui l'80% dello sforzo
  packages/hardware-control/  ACL: Suitest, ADB   (in questo giro: SOLO firme)
  packages/alerting/          generic: Slack      (in questo giro: SOLO firme)

  kernel ◀───────────── tutti           (e kernel non importa nessuno)
  registry ──▶ monitoring, recovery
  monitoring ──▶ recovery               (fatti, non decisioni)
  recovery ──▶ nessuno dei precedenti   MAI il contrario
  hardware-control ──▶ recovery         ⟵ sì, in questa direzione
  alerting ──▶ recovery                 ⟵ sì, in questa direzione
  ```

  Nel kernel ci sta **solo** ciò che non appartiene a nessuno: `Instant`, `Duration`, `Brand`,
  `DomainEvent`, `Decider`, `Clock`. Non `DeviceId` (è published language del Registry), non gli eventi di
  dominio (li possiede chi li emette).

- **A-2 · Anatomia interna, identica in ogni package.**

  ```
  src/
    domain/         PURO. Zero I/O, zero Date.now(), zero librerie di effetti. Sincrono.
    application/    use case + policy. Orchestra, coordina, pubblica.
      policies/     le reazioni "quando X allora Y"
    ports/          interfacce scritte nel linguaggio del DOMINIO (driven)
    testing/        fake e adapter in memoria, entrypoint separato
    index.ts        published language: l'unica superficie visibile agli altri package
  test/scenarios/   scenari in linguaggio di dominio (Dato/Quando/Allora)
  ```

  Le dipendenze puntano verso l'interno: `domain/` non importa `application/`, `application/` non importa
  adapter, e nessuno dei tre sa che esistono ADB, Suitest, Slack, SQLite o HTTP.

- **A-3 · Naming dei file.**
  `PascalCase.ts` = un concetto (un `type` + le funzioni che lo abitano): `RecoverySession.ts`, `Custody.ts`.
  `camelCase.ts` = una funzione (domain service, policy): `correlateOutage.ts`, `onFacetBecameUnhealthy.ts`.
  `PascalCase.ts` imperativo = un caso d'uso: `TickDueSessions.ts`, `PlaceMaintenanceHold.ts`.
  `<Tecnologia><Porta>.ts` = un adapter: `AdbDeviceControl.ts`, `InMemoryDeviceRepository.ts`.
  La tecnologia compare nel nome **solo** in `hardware-control/`, `alerting/`, `testing/`.

- **A-4 · Il modulo sostituisce la classe** (idioma fp-ts: `Option.ts`, `Either.ts`).

  ```ts
  // domain/RecoverySession.ts — un file, un concetto
  export type RecoverySession = { readonly id: RecoverySessionId; readonly phase: Phase /* ... */ }
  export const open = (/* ... */): Decision<RecoverySession, RecoveryEvent> => /* ... */
  export const decide = (s: RecoverySession, c: Command): Decision<RecoverySession, RecoveryEvent> => /* ... */

  // uso
  import * as RecoverySession from "./RecoverySession.js"
  ```

- **A-5 · Come i pattern DDD si materializzano in fp-ts.**

  | DDD classico | Qui | Dove |
  |---|---|---|
  | Aggregato con metodi mutanti | `type` immutabile + `(state, command) => [state, events]` | `domain/<Nome>.ts` |
  | Invariante nel costruttore | smart constructor `=> E.Either<DomainError, T>` | stesso file |
  | Value Object | union taggata (`_tag`) + `Brand` per i primitivi | `domain/` |
  | Domain service | funzione pura in `camelCase.ts` | `domain/` |
  | Porta | `interface XEnv` + accessor `RTE.ReaderTaskEither<XEnv, E, A>` | `ports/` |
  | Adapter | funzione che costruisce quel pezzo di record | package adapter |
  | Eccezione | errore taggato nel canale `E` di `TaskEither` | `domain/errors.ts` |

  Le tre firme che definiscono i tre strati:

  ```ts
  domain/       (state, command) => [state, events]           // puro, sincrono
  application/  (input) => RTE.ReaderTaskEither<Env, E, A>     // dichiara le porte che usa
  adapters/     (cfg) => Partial<AppEnv>                       // fornisce quelle porte
  ```

- **A-6 · Porte: `E = never` dove il fallimento è un risultato.** Una sonda che fallisce ha appena fatto il
  suo lavoro; un rimedio rifiutato è un **esito** che la sessione deve poter registrare nel dossier. Se
  finissero nel canale errore, la `RetryPolicy` dovrebbe leggerli da un catch. L'adapter traduce **tutto**
  in `ProbeOutcome` / `RemedyOutcome`: se un `AxiosError` o un exit code di adb attraversa una porta, l'ACL
  ha perso.

- **A-7 · Una porta per intento, non per tecnologia.** Esiste `DeviceControlPort`, non `SuitestPort` +
  `AdbPort`: se esistessero, il dominio dovrebbe sapere quale usare, cioè saprebbe di ADB, cioè sarebbe
  morto. Lo smistamento è un adapter di routing (A-Ext-2).

- **A-8 · Repository = domande del dominio.** Un `Repository<T>` generico con `findAll`/`where` è il
  database travestito. Uno per **aggregato**, mai per tabella, e ogni metodo è una domanda che il dominio
  si pone davvero.

- **A-9 · Tooling.** bun workspaces; `@lab/<nome>`; `exports` con sottopercorsi (`"./domain/*":
  "./src/domain/*.ts"`) come già in uso; `fp-ts@2.16.11`, `ts-pattern@5.9.0`, `io-ts` solo al confine;
  vitest; biome (2 spazi, doppi apici, riga 120, import organizzati). `bun run test` e `tsc --noEmit`
  devono essere verdi, **sorgenti e test**.

- **A-10 · Commenti in italiano.** Un docblock di testa per file: cos'è, perché esiste, e — dove serve —
  cosa **non** è. Da tre a otto righe, non venti. Inline solo dove la ragione non si legge dal codice, e
  citando il numero dell'invariante o del fatto quando è quello il motivo. Niente banner ASCII decorativi,
  niente commenti che ripetono la firma a parole.

---

## §6 · Il modello, concetto per concetto

Le forme qui sotto fissano la **semantica** e i nomi. Firme esatte, ordine dei parametri e funzioni
accessorie sono lasciati al tuo giudizio: se una forma migliore rispetta gli stessi nomi e le stesse
invarianti, usala e annotala nel report.

### M-1 · `@lab/kernel`

`Brand`, `Instant` (epoch millis, `plus/minus/between/isAtOrAfter/earliest/latest`), `Duration`
(`millis/seconds/minutes/hours`), `DomainEvent<Tag, Payload>` (solo la *forma*: gli eventi concreti stanno
nel contesto che li emette), `Decision<S, E> = { state, events }` con `decision`/`unchanged`, `Clock` come
porta (`now: IO<Instant>`) e `FakeClock` in `testing/`.

### M-2 · `@lab/registry`

```ts
type Relation = "DependsOn" | "Observes"
type Attachment = { readonly parent: DeviceId; readonly relation: Relation }

type Device = {
  readonly id: DeviceId
  readonly kind: DeviceKind
  readonly unitType: O.Option<ControlUnitType>   // valorizzato solo per kind "ControlUnit"
  readonly attachment: O.Option<Attachment>
  readonly endpoints: Endpoints                   // record di endpoint opzionali (A-Ext-1), opaco
  readonly capabilities: ReadonlySet<Capability>  // quelle REALI di questa istanza (FATTO-1)
  readonly custody: Custody
  readonly monitored: boolean
}

type Custody =
  | { readonly _tag: "Supervisor" }
  | { readonly _tag: "Operator"; readonly reason: string; readonly since: Instant }   // maintenance hold
  | { readonly _tag: "Recorder"; readonly sessionId: RecordingSessionId; readonly until: Instant }
```

```ts
type AdbEndpoint = Brand<string, "AdbEndpoint">      // "host:porta", opaco
type SuitestRef  = Brand<string, "SuitestRef">       // id lato Suitest, opaco
type Endpoints = {                                   // record, non union (A-Ext-1)
  readonly adb: O.Option<AdbEndpoint>
  readonly suitest: O.Option<SuitestRef>
}
```

`Endpoints` è l'unico punto del modello dove un indirizzo è lecito, ed è un dato **opaco**: il dominio lo
passa all'adapter, non lo interpreta mai. Una camera ne ha tipicamente due insieme (FATTO-9).

`Custody` è il concetto che copre con **un solo tipo** sia il divieto di scavalcare gli spegnimenti manuali
(FATTO-15) sia il non litigare con la futura feature di registrazione. Due `if` sparsi in meno, un'invariante
in più.

`Topology` è una proiezione ricalcolabile: `fromDevices(devices)`, `parentOf`, `childrenOf(id, relation)`,
`dependentsOf(unitId)`. Non ha stato proprio.

`Capability` ha due letture, e vanno tenute distinte: `capabilitiesOfKind(kind)` è il **soprainsieme** di ciò
che quel tipo di device può *mai* fare, e serve a `SupervisionProfile.make` per rifiutare alla nascita un
playbook assurdo (chiedere `AdbTcp` a una TV); `device.capabilities` è ciò che **quella istanza** dichiara
davvero, e il controllo avviene al dispaccio restituendo `Unsupported` (FL-2). Il primo è una guardia
precoce, il secondo è la verità.

Casi d'uso: `RegisterDevice`, `AttachDevice` (custode di INV-12), `PlaceMaintenanceHold`,
`LiftMaintenanceHold`, `GrantCustody`/`ReleaseCustody`. Eventi: `DeviceRegistered`, `DeviceRetired`,
`DeviceAttached`, `MaintenanceHoldPlaced`, `MaintenanceHoldLifted`, `CustodyGranted`, `CustodyReleased`.
Porta: `DeviceRepository` (`findById`, `findByKind`, `topology`, `save`). Fake in memoria.

Questo contesto può restare tranquillamente CRUD: il tattico si applica al core, non ovunque.

### M-3 · `@lab/monitoring`

```ts
type Facet = "Reachable" | "AdbTransport" | "StreamAvailable"     // + "ContainerAlive" domani (FL-4)
type FacetRef = { readonly deviceId: DeviceId; readonly facet: Facet }
type ProbeOutcome = { readonly ref: FacetRef; readonly at: Instant; readonly ok: boolean; readonly detail: O.Option<string> }
type HealthStatus = { _tag: "Unknown" } | { _tag: "Healthy"; since: Instant } | { _tag: "Unhealthy"; since: Instant }

type FacetHealth = { readonly ref: FacetRef; readonly status: HealthStatus; readonly consecutive: number }
const record: (h: FacetHealth, o: ProbeOutcome, p: FlappingPolicy) => Decision<FacetHealth, MonitoringEvent>
```

`Facet` sostituisce e assorbe l'idea di "che sonda uso": il dominio dichiara **quale faccia osserva**,
l'adapter sceglie il protocollo (TCP, HTTP, `adb devices`, campo Suitest). Non esiste un `ProbeSpec`
separato: sarebbe lo stesso concetto con due nomi.

**Anti-flapping (invariante di questo contesto)**: una transizione di stato si emette solo dopo
`failureThreshold` (o `successThreshold`) osservazioni concordi. Il rumore non deve mai arrivare al core.
Il `since` di `Healthy`/`Unhealthy` è l'istante della **prima** osservazione della serie che ha causato la
transizione — non quello della conferma: è il dato che INV-5 usa per distinguere una guarigione vera da una
lettura stantia, e sbagliarlo rende il confronto inutile.

`HealthSnapshot` è una fotografia immutabile (`statusOf(snapshot, ref)`, `isHealthy`, `facesOf(deviceId)`)
costruita dal repository e consegnata a recovery dentro il `SupervisionContext`.

```ts
const facetsOf: (k: DeviceKind) => ReadonlyArray<Facet>
// ControlUnit → [Reachable]   Tv → [Reachable]   AndroidCamera → [AdbTransport, StreamAvailable]
```

`facetsOf` è la sola tabella che dice cosa si sonda per ciascun tipo: la usa lo scheduler delle sonde per
sapere cosa chiedere, e l'`Incident` per sapere di cosa fotografare lo stato. Vive qui e non nel registry
perché `Facet` è published language del monitoring.

Eventi: `FacetBecameUnhealthy(deviceId, facet, since)`, `FacetBecameHealthy(deviceId, facet, since)`. Nomi
al passato, fatti, mai decisioni. Caso d'uso: `RecordProbeResults` (batch di `ProbeOutcome` → aggregati →
eventi). Porte: `HealthProbePort` (`probe(ref) => TE<never, ProbeOutcome>`), `FacetHealthRepository`
(`statusOf`, `snapshotOf(deviceIds)`, `allUnhealthy(facet)`, `saveAll`). Fake per entrambe.

### M-4 · `@lab/recovery` — i value object

```ts
type RecoveryTarget =
  | { readonly _tag: "Device"; readonly deviceId: DeviceId }
  | { readonly _tag: "ControlUnitCluster"; readonly unitId: DeviceId; readonly dependents: RNEA<DeviceId> }
// members(t): ReadonlySet<DeviceId>   actsOn(t): DeviceId   key(t): string

type Remedy =
  | { _tag: "ReconnectTransport" } | { _tag: "RestartApp"; app: AppRef } | { _tag: "RelaunchSuite" }
  | { _tag: "PowerOn" }            | { _tag: "RebootHardware" }
// requiredCapability(r): Capability

type RemedyOutcome =
  | { _tag: "Accepted" } | { _tag: "Rejected"; reason: string } | { _tag: "Unreachable" }
  | { _tag: "Unsupported" } | { _tag: "TransportError"; detail: string }

type FacetCondition = { readonly facet: Facet; readonly is: "Healthy" | "Unhealthy" }

type RemedyStep = {
  readonly remedy: Remedy
  readonly appliesWhen: O.Option<FacetCondition>   // FL-1 step 1 e 4; scartare fa avanzare (INV-4)
  readonly dispatchTimeout: Duration               // INV-10
  readonly verification: VerificationSpec
  readonly retry: RetryPolicy
}

type VerificationSpec = { readonly facet: Facet; readonly settleDelay: Duration; readonly pollInterval: Duration; readonly timeout: Duration }
type Playbook = { readonly steps: RNEA<RemedyStep> }   // smart constructor: non vuoto + INV-6
type Backoff = { _tag: "Fixed"; delay } | { _tag: "Exponential"; base; factor; cap }
type RetryPolicy = { readonly maxAttempts: number; readonly backoff: Backoff }
```

`Remedy` è il linguaggio con cui il dominio parla all'ACL: `RestartApp` **non** è `adb shell am force-stop`,
quella è una delle sue attuazioni e vive in `hardware-control`. `RelaunchSuite` è la sequenza completa di
messa online dell'app di cattura (avvio, profilo, connect), non un secondo `RestartApp`: la sua complessità
è dell'ACL (FATTO-11). Nessuna variante esprime gli smart plug, e non è una dimenticanza (NF-3).

`RemedyOutcome` è l'esito del **dispaccio**: `Accepted` significa "il comando è stato preso in carico", non
"il device è guarito". La guarigione la stabilisce solo la verifica (INV-5). Nessun `statusCode`, nessuno
`stderr`, nessun errore di libreria (A-6).

`RetryPolicy` non va confusa con il retry di **trasporto** dell'adapter: un `ECONNRESET` ritentato
dall'HTTP client non è un tentativo di recovery. Sono due livelli, e confonderli è l'errore ricorrente.

```ts
type CorrelationRule = { _tag: "AllChildren" } | { _tag: "MinChildren"; min: number } | { _tag: "Fraction"; fraction: number }
type CorrelationPolicy = { readonly rule: CorrelationRule; readonly gracePeriod: Duration }

type SupervisionProfile = {
  readonly kind: DeviceKind
  readonly trigger: Facet                      // la faccia che apre la sessione
  readonly gracePeriod: Duration
  readonly playbook: Playbook
  readonly criticality: "NotifyWhenExhausted" | "NotifyImmediately"
  readonly cooldownAfterGiveUp: Duration
  readonly window: SupervisionWindow
  readonly correlation: O.Option<CorrelationPolicy>   // solo per i kind che fanno da hub: la CU
}
const make: (draft, capsOfKind) => E.Either<InvalidPlaybookForKind, SupervisionProfile>

type SessionRules = { trigger; playbook; cooldownAfterGiveUp; criticality; correlation }   // INV-13, congelato
type SupervisionContext = { readonly window: SupervisionWindow; readonly custody: Custody; readonly health: HealthSnapshot }
```

```ts
type Verdict = "Recovered" | "NotRecovered" | "Skipped"
type AttemptRecord = {
  readonly step: StepIndex; readonly attempt: AttemptNo; readonly remedy: Remedy
  readonly dispatchedAt: Instant; readonly outcome: O.Option<RemedyOutcome>
  readonly verdict: O.Option<Verdict>; readonly closedAt: O.Option<Instant>
}
```

`AttemptRecord` è la materia prima del dossier che finisce nell'`Incident` e su Slack: per questo la storia
si tiene **dentro** l'aggregato, non si ricostruisce dai log.

Errori di dominio (`domain/errors.ts`) — rifiuti previsti dal modello, non guasti tecnici:
`EmptyPlaybook`, `LastStepMustVerifyTrigger` (INV-6), `InvalidPlaybookForKind`, `SessionNotActionable`,
`CustodyDenied`, `TooManyDependents` (INV-12), `InvalidAttachment` (INV-12). I guasti tecnici li traduce
l'adapter **prima** di attraversare la porta.

`CorrelationPolicy` vive sul profilo della **CU**, che è l'unico posto sensato: è una policy dell'hub. Al
giro precedente non aveva casa e girava come parametro orfano.

`SupervisionWindow` è un'autorizzazione, non un orario (FATTO-14): `{ days, from, to, zone }` + `isOpen(w, at)`.

### M-5 · `@lab/recovery` — le funzioni pure di dominio

```ts
// La funzione che INV-7, INV-8 e la verifica condividono. Una sola, non tre.
const isTargetHealthy: (t: RecoveryTarget, facet: Facet, rule: CorrelationRule, h: HealthSnapshot, notBefore: O.Option<Instant>) => boolean
```

Per un `Device`: la faccia è `Healthy` e — se `notBefore` è presente — il suo `since` è posteriore
(INV-5). Per un `ControlUnitCluster`: la CU è sana **e** la `rule` non la incolpa più, contando i membri
ancora giù (INV-8), con lo stesso vincolo su `since` — e la `facet` è la stessa per la CU e per i dipendenti, perché
`facetsOf` dà `Reachable` a entrambi. `notBefore` è `none` quando si controlla
l'auto-guarigione (INV-7), è l'istante di dispaccio quando si verifica un rimedio.

```ts
type OutageSnapshot = { readonly downSince: ReadonlyMap<DeviceId, Instant>; readonly correlatable: ReadonlySet<DeviceId> }
type CorrelatedTarget = { readonly target: RecoveryTarget; readonly outageSince: Instant }

const correlateOutage: (s: OutageSnapshot, topo: Topology, rule: CorrelationRule) => ReadonlyArray<CorrelatedTarget>
```

Regole, tutte da testare: solo archi `DependsOn` (INV-11); numeratore e denominatore sui soli
`correlatable`; se la CU è essa stessa giù la regola non si applica e il bersaglio è il cluster comunque
(FATTO-4); `outageSince` di un cluster è **l'istante in cui il quorum è stato raggiunto** (FL-3), quello di
un `Device` è il suo `downSince`; i bersagli restituiti sono **a due a due disgiunti** sui device e
**coprono esattamente** l'insieme dei device giù (proprietà, va testata come tale); ordine di uscita
deterministico, mai dipendente dall'iterazione di un `Set`.

### M-6 · `@lab/recovery` — `RecoverySession`, l'aggregato

```ts
type Phase =
  | { _tag: "AwaitingGrace"; outageSince: Instant; dueAt: Instant }
  | { _tag: "Executing";     step; attempt; dispatchedAt: Instant; deadline: Instant }        // INV-10
  | { _tag: "Verifying";     step; attempt; dispatchedAt: Instant; nextPollAt; deadline }     // INV-5
  | { _tag: "BackingOff";    step; attempt; resumeAt: Instant }
  | { _tag: "Resolved";      at: Instant }
  | { _tag: "GivenUp";       reason: GiveUpReason; at: Instant; retryNotBefore: Instant }     // INV-9
  | { _tag: "Aborted";       reason: AbortReason; at: Instant }

type RecoverySession = { id; target; rules: SessionRules; phase: Phase; history: ReadonlyArray<AttemptRecord> }

type Command =
  | { _tag: "Tick"; now: Instant; ctx: SupervisionContext }
  | { _tag: "RemedyOutcomeArrived"; outcome: RemedyOutcome; now: Instant }
  | { _tag: "Abort"; reason: AbortReason; now: Instant }

const open:   (id, target, profile, outageSince, now) => Decision<RecoverySession, RecoveryEvent>
const decide: (s: RecoverySession, c: Command) => Decision<RecoverySession, RecoveryEvent>
const nextDueAt: (s: RecoverySession) => O.Option<Instant>
const isActive: (s: RecoverySession) => boolean
```

Puro e sincrono: riceve `now`, decide, restituisce nuovo stato ed eventi. Il contesto viaggia **dentro** il
comando `Tick`, non nell'ambiente, così `decide` resta una funzione di due argomenti senza Reader e senza I/O.

`nextDueAt`: `AwaitingGrace → dueAt`; `Executing → deadline`; `Verifying → min(nextPollAt, deadline)`;
`BackingOff → resumeAt`; fasi terminali → `none`. Una sessione che non chiede più tick è una sessione finita:
non deve esistere una fase attiva che non chiede tick (era il buco di INV-10).

Il `Tick`, in ordine: (a) impedimenti dal contesto — finestra chiusa o custodia altrui ⇒ `Aborted`
(INV-3); (b) auto-guarigione in `AwaitingGrace`/`BackingOff` ⇒ `Aborted(SelfHealed)` (INV-7); (c) la
transizione della fase. In `Verifying` il tick valuta il verdetto con `isTargetHealthy` e `notBefore =
dispatchedAt`: verdetto positivo sulla faccia d'innesco ⇒ `Resolved` (l'unica transizione che lo produce);
positivo su faccia non-innescante ⇒ gradino successivo senza consumare tentativi (INV-6); scaduta la
`deadline` ⇒ tentativo fallito; altrimenti si riprogramma `nextPollAt`.

Eventi: `OutageConfirmed`, `RecoverySessionOpened`, `RemedyDispatched`, `RemedyFailed`, `RemedyTimedOut`,
`StepSkipped`, `StepAdvanced`, `VerificationSucceeded`, `VerificationTimedOut`, `RecoveryAttemptExhausted`,
`DeviceRecovered`, `RecoveryGivenUp`, `RecoverySessionAborted`.
`AbortReason`: `OutOfWindow`, `MaintenanceHold(by)`, `CustodyLost`, `SelfHealed`, `Superseded(bySessionId)`,
`OperatorRequest`. `GiveUpReason`: `PlaybookExhausted`, `RemedyUnsupported`.

Ogni scarto e ogni avanzamento **finiscono nella cronologia**: il dossier deve spiegare perché un gradino
non è stato provato, non solo quali sono falliti.

### M-7 · `@lab/recovery` — `Incident`

Nasce da `RecoveryGivenUp`, oppure subito dopo `OutageConfirmed` se `criticality` è `NotifyImmediately`.
Porta il dossier: cronologia dei tentativi con esiti e verdetti, **fotografia di tutte le facce di tutti i
device coinvolti** al momento della resa, ultimo errore riportato da ogni adapter. Al massimo **un**
`IncidentRaised` per sessione; se era stato alzato in anticipo e la sessione poi si risolve, si emette
`IncidentClosed`.

Se in questo file compare la parola "Slack", il modello sta perdendo: la traduzione in blocchi Slack è un
adapter che osserva questo aggregato.

### M-8 · `@lab/recovery` — porte

| Porta | Domande |
|---|---|
| `RecoverySessionRepository` | `findBlockingFor(devices, now)` (INV-1 **e** INV-9 in una domanda sola), `activeInvolving(devices)`, `dueAt(now)`, `byId`, `save` |
| `SupervisionPort` | `profileFor(target)`, `contextFor(target)` — finestra + custodia + `HealthSnapshot` dei membri |
| `SupervisionProfileRepository` | `forKind(kind)`, `save` |
| `DeviceControlPort` | `apply(deviceId, remedy) => TE<never, RemedyOutcome>` — una sola porta, per intento (A-7) |
| `NotificationPort` | `publish(incident) => TE<NotifyFailed, void>` — riceve un `Incident`, non una stringa |
| `IdsPort` | `newSessionId` |

Le porte sono definite dal **consumatore** e implementate dagli adapter: per questo `alerting` e
`hardware-control` dipendono da `recovery`, e non viceversa. È la dipendenza invertita che tiene in piedi
l'esagono.

### M-9 · `@lab/recovery` — application layer

- `OpenRecoveryForConfirmedOutage(target, outageSince, now)` — chiede `findBlockingFor` (INV-1, INV-9);
  se un bersaglio cluster assorbe sessioni attive sui figli, le aborta con `Superseded` e poi apre; se non
  c'è profilo per il kind restituisce `NoProfile` e non fa nulla (NF-1). Esiti: `Opened | AlreadyActive |
  Blocked(until) | Superseded | NoProfile`.
- `TickDueSessions(now)` — il battito: carica le sessioni dovute, per ciascuna risolve il contesto, guida
  il ciclo `comando → decide → eventi → effetti → comando` a punto fisso con un `fuel` esplicito, salva,
  pubblica gli incidenti. **Le sessioni sono indipendenti**: un adapter lento non deve poter fermare il
  batch (la porta dichiara un timeout, e INV-10 copre il dominio). Nota i due tempi, che sono cose diverse:
  il **ticker** (ogni N secondi) è un adapter driving e sta fuori da questo package; il **clock** è una
  porta che questo use case interroga. Tenerli separati è ciò che fa scorrere sei ore simulate in millisecondi.
- `AbortRecovery(target, reason, now)`.
- `ConfigureSupervisionProfile(draft)` — rifiuta al confine i playbook invalidi; **non tocca le sessioni
  aperte** (INV-13).
- Policy: `onFacetBecameUnhealthy` (carica `OutageSnapshot` + `Topology`, correla, apre i bersagli),
  `onMaintenanceHoldPlaced` (aborta — mai il contrario), `onSupervisionWindowClosed`, `onRecoveryGivenUp`
  (alza l'`Incident`; non sa che Slack esiste). Le policy sono reazioni, cioè orchestrazione: application
  layer, mai dominio.

### M-10 · `hardware-control` e `alerting` — solo firme

Crea i file con il docblock e la **firma** dell'adapter, senza implementazione: `RoutingDeviceControl`
(smista su `(kind, remedy)`, A-Ext-2), `SuitestDeviceControl` (`PowerOn`, `RebootHardware`),
`AdbDeviceControl` (`ReconnectTransport` → `adb connect`; `RestartApp` → force-stop + start;
`RebootHardware` → `adb reboot`; `RelaunchSuite` → sequenza post-boot), le sonde per faccia, e
`SlackNotifier` + `IncidentMessage`. Nel docblock di ciascuno scrivi **da dove si travasa** il codice
esistente (§9). Non reimplementare client adb o Suitest: esistono già e funzionano.

---

## §7 · Scenari di accettazione

Sono la definizione di "fatto". Vanno scritti in `packages/recovery/test/scenarios/`, raggruppati in cinque
o sei file con nomi in linguaggio di dominio (`camera-senza-stream.test.ts`,
`control-unit-cluster.test.ts`, `custodia-e-finestra.test.ts`, ...), montando l'esagono con i fake: il test
**è** l'adapter driving. Nessuno di questi tocca hardware, rete o l'orologio di sistema. Se restano brevi e
leggibili, il design regge; se per scriverne uno devi esporre un dettaglio interno dell'aggregato, il design
non regge e va detto nel report.

| # | Dato / Quando / Allora | Copre |
|---|---|---|
| **S1** | Camera con stream giù da 3 min, e non torna mai ⇒ percorre la scala una volta per gradino, poi **un solo** `Incident` con il dossier completo (tentativi, esiti, verdetti, scarti) | FL-1 |
| **S2** | Lo stream torna dopo il `RestartApp` ⇒ `Resolved`, nessun incidente, un solo comando dispacciato | FL-1, INV-5 |
| **S3** | Subito dopo il dispaccio la faccia risulta ancora `Healthy` **da prima** del comando ⇒ la sessione **non** si risolve; si risolve solo quando il `since` è posteriore al dispaccio | FATTO-13, INV-5 |
| **S4** | `AdbTransport` giù e stream giù ⇒ il primo gradino è `ReconnectTransport`; il transport torna ma lo stream no ⇒ si passa al gradino 2 **senza consumare tentativi** | FL-1, INV-6 |
| **S5** | `AdbTransport` è sano all'apertura ⇒ il gradino 1 viene **scartato** (non fallito), lo scarto compare nella cronologia, e l'indice avanza | INV-4, INV-6 |
| **S6** | L'adapter non risponde entro `dispatchTimeout` ⇒ `RemedyTimedOut`, tentativo fallito, la sessione prosegue; e le altre sessioni dovute in quel tick avanzano lo stesso | FATTO-12, INV-10 |
| **S7** | CU irraggiungibile da 1 min ⇒ reboot, torna, `Resolved` | FL-2 |
| **S8** | CU irraggiungibile, reboot accettato due volte, non torna mai ⇒ un solo `Incident` | FL-2 |
| **S9** | CU che non dichiara `RebootHardware` ⇒ esito `Unsupported` ⇒ resa **immediata**, zero ritentativi | FL-2 |
| **S10** | Le 4 TV di una CU cadono (la CU risponde) ⇒ **una** sessione, bersaglio `ControlUnitCluster`, **zero** sessioni sulle TV; `outageSince` = istante del quorum | FL-3, INV-11 |
| **S11** | Una TV era già in sessione quando il quorum si forma ⇒ quella sessione viene abortita con `Superseded` e ne resta **una sola** attiva | INV-1 |
| **S12** | Reboot della CU accettato, la CU torna ma le TV no ⇒ **non** risolta: esaurisce e alza un incidente | FL-3, INV-8 |
| **S13** | Tre camere giù, appese via `Observes` a TV della stessa CU ⇒ tre bersagli `Device`, **mai** un reboot della CU | FATTO-3, NF-2, INV-11 |
| **S14** | Una delle 4 TV è sotto maintenance hold, le altre 3 cadono, la regola è `AllChildren` ⇒ la TV in hold esce dal conto e il quorum **è** raggiunto | INV-11 |
| **S15** | Device giù, sessione aperta, il device torna sano **prima** che scada il grace ⇒ sessione `Aborted(SelfHealed)`, **zero** comandi dispacciati | INV-7 |
| **S16** | Maintenance hold a metà recupero ⇒ `Aborted`, nessun comando dopo, nessun incidente (un hold non è un guasto); e al ciclo successivo la sessione **non** viene riaperta | FATTO-15, INV-3, INV-9 |
| **S17** | Dopo una resa, per tutta la durata del cooldown non si apre nulla sugli stessi device anche se restano giù; scaduto il cooldown si riapre | INV-9 |
| **S18** | Fuori dalla finestra nessun dispaccio; alla chiusura della finestra le sessioni attive abortiscono con `OutOfWindow` | FATTO-14, INV-3 |
| **S19** | Una TV giù da sola ⇒ `NoProfile`, nessuna sessione — ma la TV partecipa comunque alla correlazione | NF-1 |
| **S20** | Anagrafica: attaccare una 5ª TV alla stessa CU ⇒ errore di dominio; attaccare una camera `DependsOn` a una CU ⇒ errore di dominio | INV-12 |
| **S21** | Proprietà di `correlateOutage`: su un insieme qualunque di device giù, i bersagli sono a due a due disgiunti e coprono esattamente quell'insieme | M-5 |
| **S22** | Cambiare il profilo mentre una sessione è aperta non altera quella sessione; chiudere la finestra invece ha effetto immediato | INV-13 |

---

## §8 · Consegna

### 8.1 · Criteri di rifiuto

La consegna è da rifare, non da correggere, se anche uno solo di questi è vero.

- **NO-1** — In `domain/` compare una `Promise`, un `Task`, un `TaskEither`, `Date.now()`, un import di
  `application/`, `ports/` o di un package adapter.
- **NO-2** — Esiste più di una funzione che decide se un bersaglio è sano (M-5).
- **NO-3** — La verifica di un rimedio esegue una sonda propria invece di leggere la salute confermata
  (§4.1), oppure può risolvere su uno stato sano anteriore al dispaccio (INV-5).
- **NO-4** — La correlazione può attraversare un arco `Observes`, o conta figli non correlabili (INV-11).
- **NO-5** — Un cluster può risolversi con la sola CU sana (INV-8).
- **NO-6** — Esistono due sessioni attive che condividono un device (INV-1).
- **NO-7** — Esiste una fase attiva che non chiede tick, o un percorso in cui una sessione resta appesa
  per sempre (INV-10).
- **NO-8** — Compare un concetto per gli smart plug: un `DeviceKind`, una `Capability`, un `Remedy`, una
  porta, o anche solo un `if` che li esclude (NF-3).
- **NO-9** — Il dominio contiene una diramazione su `DeviceKind` per scegliere una tecnologia, o la parola
  "adb", "suitest", "slack", "sqlite", "http" fuori dai package adapter.
- **NO-10** — Un errore tecnico (status code, `stderr`, eccezione di libreria) attraversa una porta (A-6).
- **NO-11** — Un `TODO`, uno stub vuoto o un `throw new Error("not implemented")` in `domain/`,
  `application/` o `ports/`.
- **NO-12** — `bun run test` o `tsc --noEmit` non sono verdi, sorgenti **e** test inclusi.

### 8.2 · Autoverifica obbligatoria

Prima di consegnare, ripercorri **una per una** le invarianti INV-1…INV-13 e gli scenari S1…S22 e verifica
che per ciascuno esista il test che lo dimostra e che sia verde. Ripercorri i criteri NO-1…NO-12 e
verificane la negazione, cercandoli davvero nel codice (una `grep` per `Date.now`, per `TaskEither` sotto
`domain/`, per i nomi di tecnologia fuori dagli adapter), non a memoria.

### 8.3 · Report finale

Chiudi con un messaggio di al massimo due pagine, in italiano, con esattamente queste sei sezioni:

1. **File creati**, per package, con una riga di descrizione ciascuno.
2. **Invarianti**, tabella `INV-n → file che la custodisce → test che la dimostra`.
3. **Scenari**, tabella `S-n → file:test → verde/rosso`. Nessun rosso è ammesso.
4. **Assunzioni prese**, ogni volta che questo documento era ambiguo o incompleto: cosa hai deciso, perché,
   e cosa cambierebbe se la decisione fosse sbagliata.
5. **Estendibilità al flusso TV/CDP** (FL-4): dieci righe che elencano cosa esattamente si aggiungerà e
   perché il core non cambierà.
6. **Debolezze del modello**: i due o tre punti in cui, se dovessi scommettere, il modello cederà per primo
   quando il lab crescerà. Sii specifico e onesto; una consegna senza questa sezione è incompleta.

---

## §9 · Cosa NON fare in questo giro

- **NO-13** — Non scrivere `apps/supervisor` (composition root, ticker, scheduler, HTTP, persistenza
  SQLite). I profili reali del lab vivranno lì; in questo giro stanno solo come **fixture** dei test, in
  `test/fixtures/labProfiles.ts`.
- **NO-14** — Non implementare gli adapter reali (Suitest, ADB, Slack, SQLite): solo firme e docblock (M-10).
- **NO-15** — Non implementare il flusso TV/CDP (FL-4), né la feature di registrazione, né la dashboard.
- **NO-16** — Non toccare `legacy/`, né importarlo da un package sotto `packages/`.
- **NO-17** — Non introdurre Effect, né sostituire fp-ts, né aggiungere dipendenze oltre a quelle già nel
  monorepo.

### Riuso da `legacy/core/src/` (progetto pre-DDD, potato)

`legacy/` contiene **solo** adapter tecnici e modelli puri del progetto pre-DDD: il vecchio motore di
recovery (`core/recovery/**`, `core/workflow/**`) non è stato portato in questo branch. Non per
dimenticanza — vederlo è la tentazione più forte a copiarlo con un'etichetta DDD sopra, e la si taglia alla
radice invece di fidarsi dell'istruzione "non copiare". Quello che resta si legge per capire il lab, non si
copia — con una sola eccezione netta.

| Cosa | Dove atterrerà | Natura |
|---|---|---|
| `legacy/core/src/lab-registry/{registry,tv,candybox,camera,adb}.ts` | `@lab/registry/domain` | quasi diretto |
| `legacy/core/src/adapters/suitest.ts`, `suitest-store/**` | i **fatti** della §1: fonte di FATTO-1/2/3/6/7/8 | solo lettura |
| `legacy/core/src/adapters/adb/**`, `android-bridge/**`, `shell.ts`, `avahi-browse.ts` | `hardware-control/adb` (dopo questo giro); `android-bridge/model.ts` è la fonte di FATTO-11/12 (transport "incastrato", `RebootDispatched` vs `ConnectionLost`) | travaso |
| `legacy/core/src/retry/**` | `recovery/domain/RetryPolicy.ts` | diretto, separando policy di dominio e retry di trasporto |
| `legacy/core/src/schedule/**` | `recovery/domain/SupervisionWindow.ts` | diretto |
| `legacy/core/src/date-time.ts` | `@lab/kernel` | diretto |
| `legacy/core/src/adapters/slack.ts` | `alerting` (dopo questo giro) | travaso |
| `legacy/core/src/state-machine/machine.ts` | la parte pura ispira `Decider` nel kernel; il runner resta fuori | split |

L'unica trappola che resta, perché è nel codice che **è** presente: **il vocabolario si scontra.**
`Machine.Reducer<State, Event, Intent>` usa "Event" per l'**input** e "Intent" per l'**output**. In DDD è
l'opposto: entra un **comando**, esce un **evento** (fatto al passato). I parametri di tipo sono
posizionali, quindi il riuso di `state-machine/machine.ts` è immediato — ma le parole si scelgono una volta
sola. Qui vince il DDD.
