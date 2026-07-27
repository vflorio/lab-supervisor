import * as O from "fp-ts/Option";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Logger from "../logger/logger";
import { dispatch } from "./dispatch";
import type { NotifyRule } from "./model";

interface FakeLogger extends Logger.Tagged {
  readonly calls: readonly { readonly level: string; readonly message: string }[];
}

const makeLogger = (): FakeLogger => {
  const calls: { level: string; message: string }[] = [];
  const record = (level: string) => (message: string) => (): void => {
    calls.push({ level, message });
  };

  const logger: FakeLogger = {
    debug: record("debug"),
    info: record("info"),
    warn: record("warn"),
    error: record("error"),
    logNetwork: record("logNetwork"),
    child: () => logger,
    calls,
  };

  return logger;
};

const rule = (policy: NotifyRule["policy"]): NotifyRule => ({
  type: { type: "slack" },
  channel: "#lab-supervisor",
  message: { type: "template", message: "Camera recovery failed" },
  policy,
});

describe("notify/dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips rules whose policy doesn't include the current lifecycle", async () => {
    const logger = makeLogger();

    const results = await dispatch([rule(["exhausted"])], "immediate", {}, { logger, slack: O.none })();

    expect(results).toHaveLength(0);
    expect(logger.calls).toHaveLength(0);
  });

  it("always logs, and marks slack as skipped when not configured", async () => {
    const logger = makeLogger();

    const results = await dispatch([rule(["immediate"])], "immediate", {}, { logger, slack: O.none })();

    expect(results).toStrictEqual([
      { rule: rule(["immediate"]), message: "Camera recovery failed", slack: { type: "skipped" } },
    ]);
    expect(logger.calls.some((c) => c.level === "info" && c.message.includes("notify[immediate]"))).toBe(true);
    expect(logger.calls.some((c) => c.level === "debug" && c.message.includes("skipped"))).toBe(true);
  });

  it("dispatches to slack and reports the outcome", async () => {
    const logger = makeLogger();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const results = await dispatch(
      [rule(["immediate"])],
      "immediate",
      {},
      { logger, slack: O.some({ botToken: "xoxb-test" }) },
    )();

    expect(results).toStrictEqual([
      { rule: rule(["immediate"]), message: "Camera recovery failed", slack: { type: "sent" } },
    ]);
  });

  it("logs and swallows a slack failure instead of throwing", async () => {
    const logger = makeLogger();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "channel_not_found" }), { status: 200 })),
    );

    const results = await dispatch(
      [rule(["immediate"])],
      "immediate",
      {},
      { logger, slack: O.some({ botToken: "xoxb-test" }) },
    )();

    expect(results).toStrictEqual([
      {
        rule: rule(["immediate"]),
        message: "Camera recovery failed",
        slack: { type: "failed", error: { type: "SlackAPIError", message: "channel_not_found" } },
      },
    ]);
    expect(logger.calls.some((c) => c.level === "error" && c.message.includes("slack dispatch failed"))).toBe(true);
  });

  it("substitutes {{placeholder}} vars in the rule message, leaving unknown ones untouched", async () => {
    const logger = makeLogger();
    const withTemplate: NotifyRule = {
      ...rule(["immediate"]),
      message: { type: "template", message: "{{label}} recovery failed (ip: {{ip}}, ref: {{missing}})" },
    };

    const results = await dispatch(
      [withTemplate],
      "immediate",
      { label: "Lenovo Tab M10", ip: "192.168.1.4:5555" },
      { logger, slack: O.none },
    )();

    expect(results).toStrictEqual([
      {
        rule: withTemplate,
        message: "Lenovo Tab M10 recovery failed (ip: 192.168.1.4:5555, ref: {{missing}})",
        slack: { type: "skipped" },
      },
    ]);
  });
});
