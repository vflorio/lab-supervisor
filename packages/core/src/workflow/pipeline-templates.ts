import * as Predicates from "../predicates/expression";
import * as Condition from "./condition";
import type { Pipeline } from "./pipeline";

// Esempi pronti all'uso di composizione and/or/not/condition di Pipeline (vedi ./pipeline per la
// semantica: or = tenta ed esegue escalation, and = tutti devono riuscire in sequenza, not = inverte
// l'esito, condition = gate senza esecuzione). Servono da libreria di riferimento per il futuro
// pipeline builder e riferiscono per nome i workflow di ./templates, in modo che i due insiemi
// restino coerenti tra loro.

export interface PipelineTemplate {
  readonly label: string;
  readonly description: string;
  readonly pipeline: Pipeline;
}

export const PIPELINE_TEMPLATES: readonly PipelineTemplate[] = [
  {
    label: "Singolo workflow",
    description: "Caso base: un pipeline può essere anche solo un riferimento diretto a un workflow per nome.",
    pipeline: { type: "workflow", workflowName: "wake_and_check" },
  },
  {
    label: "Escalation a due livelli",
    description:
      "`or`: prova prima il tentativo più leggero e, solo se fallisce, esegue quello più invasivo (escalation, non un semplice retry dello stesso livello).",
    pipeline: {
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "wake_and_check" },
        { type: "workflow", workflowName: "restart_app" },
      ],
    },
  },
  {
    label: "Precondizione con gate",
    description:
      "`and` combina una `condition` (gate senza esecuzione, es. \"non riavviare mentre si sta registrando\") con l'escalation vera e propria: se il gate è falso l'intero pipeline fallisce prima di toccare il device.",
    pipeline: {
      type: "and",
      pipelines: [
        { type: "condition", condition: Condition.not(Predicates.ref("recording_active")) },
        {
          type: "or",
          pipelines: [
            { type: "workflow", workflowName: "wake_and_check" },
            { type: "workflow", workflowName: "restart_app" },
          ],
        },
      ],
    },
  },
  {
    label: "Scala di recovery a tre livelli",
    description:
      "`or` annidabile su più rami: ogni tentativo è più invasivo del precedente, dal semplice risveglio del device fino al recovery completo.",
    pipeline: {
      type: "or",
      pipelines: [
        { type: "workflow", workflowName: "wake_and_check" },
        { type: "workflow", workflowName: "restart_app" },
        { type: "workflow", workflowName: "full_recovery" },
      ],
    },
  },
  {
    label: "Esegui solo se l'altro non ce l'ha fatta",
    description:
      "`not` inverte l'esito dell'intero pipeline che racchiude (non di una singola condition): qui l'azione più invasiva parte solo se il controllo di connettività non è riuscito.",
    pipeline: {
      type: "and",
      pipelines: [
        { type: "not", pipeline: { type: "workflow", workflowName: "await_stable_connection" } },
        { type: "workflow", workflowName: "restart_app" },
      ],
    },
  },
];
