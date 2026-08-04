import * as BooleanTree from "../boolean-tree/tree";
import * as Condition from "../fact/condition";
import { PIPELINE_TEMPLATES } from "../workflow/pipeline-templates";
import type { RecoveryPolicy, RecoveryTripwire } from "./model";

// Esempi pronti all'uso di RecoveryTripwire/RecoveryPolicy: mostrano come si compone un
// predicate (and/or/not su fatti osservati), quale pipeline riferire (vedi ../workflow/pipeline-templates)
// e come incatenare più tripwire per grace crescente in un'unica escalation ladder. Libreria di
// riferimento per il futuro recovery builder, non config di produzione.

export interface RecoveryTripwireTemplate {
  readonly label: string;
  readonly description: string;
  readonly tripwire: RecoveryTripwire;
}

export const RECOVERY_TRIPWIRE_TEMPLATES: readonly RecoveryTripwireTemplate[] = [
  {
    label: "Recovery a livello singolo",
    description:
      "Predicate diretto (un solo fatto negato), pipeline minima, retry con backoff esponenziale limitato: il caso più semplice.",
    tripwire: {
      grace: "30s",
      predicate: BooleanTree.not(Condition.ref("suitest_camera_connected")),
      pipeline: { type: "workflow", workflowName: "wake_and_check" },
      retry: [
        ["exponentialBackoff", "1s"],
        ["capDelay", "30s"],
        ["limitRetries", 5],
      ],
    },
  },
  {
    label: "Predicate composto con gate di manutenzione",
    description:
      'Il predicate è un `and` di due fatti negati: scatta solo se il device risulta offline E non si è in manutenzione (altrimenti il gate di manutenzione da solo basterebbe a tenere lo stato "sano").',
    tripwire: {
      grace: "45s",
      predicate: BooleanTree.and([
        BooleanTree.not(Condition.ref("adb_device_online")),
        BooleanTree.not(Condition.ref("maintenance_mode")),
      ]),
      pipeline: PIPELINE_TEMPLATES[1]!.pipeline, // escalation a due livelli
      retry: [
        ["constantDelay", "5s"],
        ["limitRetries", 3],
      ],
      notify: [
        {
          type: { type: "slack" },
          channel: "#lab-alerts",
          message: { type: "template", message: "Recovery scattato su {{entityId}} ({{domain}})" },
          policy: ["immediate"],
        },
      ],
    },
  },
  {
    label: "Recovery con precondizione e notifica di esaurimento",
    description:
      'Riusa il pipeline con gate + escalation ("non riavviare mentre si registra") e notifica solo quando i retry sono esauriti, non ad ogni tentativo.',
    tripwire: {
      grace: "1m",
      predicate: BooleanTree.not(Condition.ref("suitest_camera_connected")),
      pipeline: PIPELINE_TEMPLATES[2]!.pipeline, // precondizione con gate
      retry: [
        ["exponentialBackoff", "2s"],
        ["capDelay", "1m"],
        ["limitRetries", 8],
      ],
      notify: [
        {
          type: { type: "slack" },
          channel: "#lab-alerts",
          message: { type: "template", message: "Recovery esaurito su {{entityId}}: intervento manuale richiesto" },
          policy: ["exhausted"],
        },
      ],
    },
  },
];

export interface RecoveryPolicyTemplate {
  readonly label: string;
  readonly description: string;
  readonly policy: RecoveryPolicy;
}

// Una policy compone più tripwire in un'unica scala di escalation, ordinati per grace crescente:
// non un retry ripetuto dello stesso livello, ma soglie di tolleranza via via più larghe con
// azioni via via più invasive (vedi ./model#RecoveryPolicy).
export const RECOVERY_POLICY_TEMPLATES: readonly RecoveryPolicyTemplate[] = [
  {
    label: "Escalation a tre livelli",
    description:
      "Stesso dominio, tre soglie di grace crescenti: al primo scatto un semplice risveglio, poi un riavvio app, infine il recovery completo con notifica di esaurimento.",
    policy: {
      label: "adb_full_escalation",
      domain: "adb",
      tripwires: [
        {
          grace: "30s",
          predicate: BooleanTree.not(Condition.ref("adb_device_online")),
          pipeline: { type: "workflow", workflowName: "wake_and_check" },
          retry: [
            ["constantDelay", "2s"],
            ["limitRetries", 3],
          ],
        },
        {
          grace: "2m",
          predicate: BooleanTree.not(Condition.ref("adb_device_online")),
          pipeline: { type: "workflow", workflowName: "restart_app" },
          retry: [
            ["exponentialBackoff", "1s"],
            ["capDelay", "30s"],
            ["limitRetries", 5],
          ],
        },
        {
          grace: "10m",
          predicate: BooleanTree.not(Condition.ref("adb_device_online")),
          pipeline: { type: "workflow", workflowName: "full_recovery" },
          retry: [
            ["constantDelay", "30s"],
            ["limitRetries", 2],
          ],
          notify: [
            {
              type: { type: "slack" },
              channel: "#lab-alerts",
              message: {
                type: "template",
                message: "Escalation esaurita su {{entityId}}: intervento manuale richiesto",
              },
              policy: ["exhausted"],
            },
          ],
        },
      ],
    },
  },
];
