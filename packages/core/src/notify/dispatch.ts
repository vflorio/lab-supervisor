import { pipe } from "fp-ts/function";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { format } from "../errors";
import type * as Logger from "../logger";
import type { SlackConfig } from "../services/slack";
import * as Slack from "../services/slack";
import type { NotifyLifecycle, NotifyRule } from "./model";

// -------------------------------------------------------------------------------------
// Dispatch - per ogni rule il cui `policy` include il lifecycle corrente: logga sempre
// (console/file, indipendente da tutto il resto) e, se il target è "slack" e `ctx.slack`
// è presente (config.slack.active), posta il messaggio via Services.Slack.postMessage.
// Un fallimento di dispatch viene loggato e inghiottito: una notifica persa non deve mai
// far fallire il motore che la genera (stesso principio di service-lifecycle.ts).
// -------------------------------------------------------------------------------------

export interface NotifyContext {
  readonly logger: Logger.Tagged;
  // Presente solo se config.slack.active - assente = target "slack" sempre skippato
  readonly slack?: SlackConfig;
}

export type SlackDispatchResult = "sent" | "skipped" | "failed";

export interface NotifyDispatchResult {
  readonly rule: NotifyRule;
  readonly slack: SlackDispatchResult;
}

const dispatchSlack = (rule: NotifyRule, ctx: NotifyContext): T.Task<SlackDispatchResult> => {
  if (!ctx.slack) {
    ctx.logger.debug(`notify: slack target skipped (not configured/active) - channel ${rule.channel}`)();
    return T.of("skipped");
  }

  return pipe(
    Slack.postMessage(ctx.slack, { channel: rule.channel, text: rule.message }),
    TE.match(
      (error) => {
        ctx.logger.error(`notify: slack dispatch failed - ${format(error)}`)();
        return "failed" as const;
      },
      () => "sent" as const,
    ),
  );
};

const dispatchRule = (
  rule: NotifyRule,
  lifecycle: NotifyLifecycle,
  ctx: NotifyContext,
): T.Task<NotifyDispatchResult> => {
  ctx.logger.info(`notify[${lifecycle}] ${rule.channel}: ${rule.message}`)();

  return pipe(
    dispatchSlack(rule, ctx),
    T.map((slack) => ({ rule, slack })),
  );
};

export const dispatch = (
  rules: readonly NotifyRule[],
  lifecycle: NotifyLifecycle,
  ctx: NotifyContext,
): T.Task<readonly NotifyDispatchResult[]> => {
  const matched = rules.filter((rule) => rule.policy.includes(lifecycle));
  return T.sequenceArray(matched.map((rule) => dispatchRule(rule, lifecycle, ctx)));
};
