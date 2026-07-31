import * as Predicates from "../predicates/expression";
import * as Condition from "./condition";
import type { Workflow } from "./workflow";

// Esempi pronti all'uso di composizione di Command (sequenza piatta, ma con await/when che
// intrecciano Condition - fatti osservati e probe live - dentro il flusso). Servono da libreria
// di riferimento per il futuro workflow builder e sono richiamati per nome dai template di
// ./pipeline-templates e ../recovery/templates, così l'intera catena resta coerente.

export interface WorkflowTemplate {
  readonly label: string;
  readonly description: string;
  readonly workflow: Workflow;
}

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    label: "Sveglia e verifica",
    description: "Sequenza minima: riaccende lo schermo e attende che il device torni raggiungibile via ADB.",
    workflow: {
      name: "wake_and_check",
      commands: [{ type: "wakeUp" }, { type: "waitForDevice" }],
    },
  },
  {
    label: "Riavvio app con verifica activity",
    description:
      "Forza il riavvio dell'app e poi attende, con timeout, che l'activity attesa torni in foreground: `await` distingue il successo del comando dall'effettiva guarigione del device.",
    workflow: {
      name: "restart_app",
      commands: [
        { type: "restartApp", packageId: "com.example.app" },
        { type: "await", condition: Condition.probe("activityResumed", ".MainActivity"), timeout: "30s" },
      ],
    },
  },
  {
    label: "Diramazione condizionale",
    description:
      "`when` valuta una condizione composta (probe + negazione, `and`/`not`) una sola volta e delega l'esecuzione a un altro workflow per nome, senza blocchi annidati.",
    workflow: {
      name: "check_and_branch",
      commands: [
        {
          type: "when",
          condition: Condition.and([Condition.probe("screenOn"), Condition.not(Condition.probe("keyguardShowing"))]),
          thenWorkflow: "wake_and_check",
          elseWorkflow: "restart_app",
        },
      ],
    },
  },
  {
    label: "Attesa su condizione mista",
    description:
      "Combina un fatto osservato (predicate `ref`) e una probe live in `or`, dentro un `await`: la stessa Condition può mescolare le due sorgenti di verità, e basta che una delle due si verifichi per sbloccare la sequenza.",
    workflow: {
      name: "await_stable_connection",
      commands: [
        { type: "wakeUp" },
        {
          type: "await",
          condition: Condition.or([Predicates.ref("adb_device_online"), Condition.probe("screenOn")]),
          timeout: "45s",
        },
        { type: "sleep", duration: "2s" },
      ],
    },
  },
  {
    label: "Composizione nidificata",
    description:
      "`run` invoca un altro workflow per nome: la sequenza principale resta piatta, ma la logica si compone riusando workflow più piccoli (la profondità di nesting è comunque limitata da MAX_WORKFLOW_DEPTH per prevenire cicli run/when).",
    workflow: {
      name: "full_recovery",
      commands: [
        { type: "run", workflowName: "restart_app" },
        {
          type: "when",
          condition: Condition.not(Condition.probe("activityResumed", ".MainActivity")),
          thenWorkflow: "wake_and_check",
        },
      ],
    },
  },
];
