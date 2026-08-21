import * as Duration from "@lab/kernel/Duration";
import * as Instant from "@lab/kernel/Instant";
import * as GiveUpReason from "@lab/recovery/domain/GiveUpReason";
import type { Incident } from "@lab/recovery/domain/Incident";
import * as RecoverySessionId from "@lab/recovery/domain/RecoverySessionId";
import * as RecoveryTarget from "@lab/recovery/domain/RecoveryTarget";
import * as DeviceId from "@lab/registry/domain/DeviceId";
import * as E from "fp-ts/Either";
import * as O from "fp-ts/Option";
import { describe, expect, it } from "vitest";
import * as SlackNotifier from "./SlackNotifier";
import * as RecordingSlack from "./testing/RecordingSlack";

const t0 = Instant.fromEpochMillis(1_700_000_000_000);

const config: SlackNotifier.SlackConfig = {
  baseUrl: SlackNotifier.defaultBaseUrl,
  botToken: "xoxb-test",
  channel: "#lab-alerts",
  timeoutMs: 5_000,
};

const incident: Incident = {
  sessionId: RecoverySessionId.of("sess-1"),
  target: RecoveryTarget.device(DeviceId.of("cam-1")),
  criticality: "NotifyWhenExhausted",
  outageSince: t0,
  raisedAt: Instant.plus(t0, Duration.minutes(12)),
  reason: O.some(GiveUpReason.playbookExhausted),
  history: [],
  facets: [],
  lastFailures: [],
  closedAt: O.none,
};

type Payload = { readonly channel: string; readonly text: string; readonly blocks: ReadonlyArray<{ type: string }> };

describe("SlackNotifier", () => {
  it("pubblica sul canale configurato, con testo semplice e blocchi", async () => {
    const slack = RecordingSlack.make();
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(E.isRight(result)).toBe(true);
    expect(slack.posted()).toHaveLength(1);
    const payload = slack.posted()[0]!.body as Payload;
    expect(slack.posted()[0]!.url).toBe("https://slack.com/api/chat.postMessage");
    expect(payload.channel).toBe("#lab-alerts");
    // Il testo semplice è ciò che compare nella notifica push: senza, sul telefono si vede vuoto.
    expect(payload.text).toContain("cam-1 non recuperato");
    expect(payload.blocks.map((block) => block.type)).toEqual(["header", "section", "context"]);
  });

  it("un `ok: false` dentro un 200 è un fallimento, non una consegna riuscita", async () => {
    const slack = RecordingSlack.make();
    slack.rejectWith("channel_not_found");
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(result).toEqual(E.left({ _tag: "NotifyFailed", detail: "channel_not_found" }));
  });

  it("una notifica non consegnata finisce nel canale d'errore: è un guasto del canale, non un esito del recupero (A-6)", async () => {
    const slack = RecordingSlack.make();
    slack.failWith({ _tag: "Timeout", afterMs: 5_000 });
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(result).toEqual(E.left({ _tag: "NotifyFailed", detail: "nessuna risposta entro 5000ms" }));
    expect(slack.posted()).toEqual([]);
  });
});
