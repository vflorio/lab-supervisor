// Dove il vocabolario straniero diventa il nostro: ventiquattro `status` Suitest si riducono al
// booleano che la faccia `Reachable` di una TV significa (FATTO-7). Sta in un file suo perché è
// l'unica parte del versante Suitest che è un *giudizio* e non un travaso, e un giudizio va scritto
// dove si può leggere e correggere in un punto solo.
// La domanda a cui risponde non è "Suitest può usarlo adesso" ma "il device dà segno di sé":
// `TESTING` è occupatissimo e vivo, `OFF` e `OFFLINE` sono i due modi di non rispondere.

import type { DeviceStatus } from "./Codecs";

// Vivo: raggiungibile e libero, oppure raggiungibile e occupato. Un device che sta eseguendo un
// test, riavviandosi o accendendosi sta comunicando con Suitest: non è un guasto.
const alive: ReadonlySet<DeviceStatus> = new Set<DeviceStatus>([
  "CONTROLLABLE",
  "READY",
  "API_CONTROLLED",
  "CANDYBOX_UPDATE",
  "CLEANUP",
  "INTERACTIVE_MODE",
  "MAINTENANCE",
  "MANUAL_RUN",
  "POWER_ON",
  "RESTARTING",
  "SHUTDOWN",
  "SUITEST_DRIVE_UPDATE",
  "TESTING",
]);

// Tutto il resto — `OFF`, `OFFLINE` e ogni stato d'errore — è "non risponde". Che poi la causa sia
// un cavo staccato o un blaster rotto non cambia la faccia: cambia la diagnosi, che infatti viaggia
// a parte nel `detail` del `ProbeOutcome`.
export const isReachable = (status: DeviceStatus): boolean => alive.has(status);

// Il perché, in lingua leggibile, per chi leggerà l'incidente su Slack senza aprire i log
// (FATTO-16).
export const describe = (status: DeviceStatus): string => `status Suitest: ${status}`;
