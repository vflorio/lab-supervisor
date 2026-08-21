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
  it("publishes on the configured channel, with plain text and blocks", async () => {
    const slack = RecordingSlack.make();
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(E.isRight(result)).toBe(true);
    expect(slack.posted()).toHaveLength(1);
    const payload = slack.posted()[0]!.body as Payload;
    expect(slack.posted()[0]!.url).toBe("https://slack.com/api/chat.postMessage");
    expect(payload.channel).toBe("#lab-alerts");
    // Plain text is what appears in push notification: without it, the phone shows nothing.
    expect(payload.text).toContain("cam-1 not recovered");
    expect(payload.blocks.map((block) => block.type)).toEqual(["header", "section", "context"]);
  });

  it("an `ok: false` inside a 200 is a failure, not a successful delivery", async () => {
    const slack = RecordingSlack.make();
    slack.rejectWith("channel_not_found");
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(result).toEqual(E.left({ _tag: "NotifyFailed", detail: "channel_not_found" }));
  });

  it("an undelivered notification ends in the error channel: it is a channel failure, not a recovery outcome (A-6)", async () => {
    const slack = RecordingSlack.make();
    slack.failWith({ _tag: "Timeout", afterMs: 5_000 });
    const notifier = SlackNotifier.make(config, slack.transport);

    const result = await notifier.publish(incident)();

    expect(result).toEqual(E.left({ _tag: "NotifyFailed", detail: "no response within 5000ms" }));
    expect(slack.posted()).toEqual([]);
  });
});
