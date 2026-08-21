# `@lab/supervisor` — il servizio

Il composition root: mette insieme i sei bounded context, gli adapter verso adb, Suitest e Slack, e i
due tempi che fanno girare il tutto. Non contiene modello: se qui dentro compare una regola di
dominio, è nel posto sbagliato.

```
bun run --filter @lab/supervisor start          # config/config.lab.jsonc
bun run src/index.ts --config <percorso>        # dalla cartella dell'app
```

## Cosa succede quando parte

1. **Legge la configurazione** (`config/Config.ts`). È il confine: io-ts sta lì e solo lì. Un
   playbook che non potrebbe mai risolversi, un rimedio che quel tipo di device non saprà mai
   eseguire, una topologia impossibile (INV-12) fermano l'avvio — non la terza notte di incidenti.
2. **Costruisce l'anagrafica e i profili** passando dai casi d'uso, non scrivendo nei repository.
3. **Batte due tempi indipendenti**:
   - *osservazione* (`monitoring.probeInterval`): sonda tutte le facce dei device monitorati,
     l'anti-flapping decide cosa è confermato, e ciò che risulta giù viene proposto al core;
   - *recupero* (`recovery.tickInterval`): le finestre che si chiudono fermano ciò che avevano
     autorizzato, poi le sessioni dovute avanzano di un passo.

I due tempi sono separati apposta: un tick del recupero che aspettasse le sonde ne erediterebbe la
latenza, e una sonda che aspettasse un reboot smetterebbe di osservare il resto del lab.

## Cosa non c'è ancora

- **Persistenza.** Lo stato vive nel processo (`src/Persistence.ts` dice cosa costa un riavvio).
  Le porte sono già il posto in cui SQLite atterrerà.
- **API.** Niente HTTP/tRPC: un maintenance hold oggi non si può mettere da fuori, e la
  configurazione è l'unica fonte dell'anagrafica.
- **Smart plug.** Accendere una CU o comandare una TV resta `Unsupported`: non è una lacuna
  dell'adapter, è come sta il mondo finché quel canale non esiste (FATTO-5, NF-3).
- **Sincronizzazione da Suitest.** L'anagrafica si scrive a mano nel file; il branch `main` la
  riconciliava con l'API, e quel travaso è il prossimo passo naturale.

## Come si mette alla prova

`test/servizio.test.ts` monta il servizio **intero** e sostituisce solo i tre punti che toccano il
mondo — orologio, `adb`, rete. Verifica il montaggio, non il dominio: che la sonda giusta legga la
faccia giusta, che il rimedio esca dal canale giusto, che una camera giù non faccia riavviare la
ControlUnit che non c'entra.
