import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import { format } from "../errors";
import type * as Logger from "../logger";
import type { SlackConfig } from "../services/slack";
import * as Slack from "../services/slack";
import type { NotifyLifecycle, NotifyRule } from "./model";
import * as Template from "./template";

// -------------------------------------------------------------------------------------
// Dispatch - per ogni rule il cui `policy` include il lifecycle corrente:
// logga e se il target è "slack" e `ctx.slack`  è presente (config.slack.active),
// posta il messaggio via Services.Slack.postMessage.
// Un fallimento di dispatch viene loggato e inghiottito:
// una notifica persa non deve mai far fallire il motore che la genera
// -------------------------------------------------------------------------------------

export interface NotifyContext {
  readonly logger: Logger.Tagged;
  // None se config.slack.active è false - target "slack" sempre skippato in quel caso
  readonly slack: O.Option<SlackConfig>;
}

export type SlackDispatchResult =
  | { readonly type: "sent" }
  | { readonly type: "skipped" }
  | { readonly type: "failed"; readonly error: Slack.SlackError };

const sent: SlackDispatchResult = { type: "sent" };
const skipped: SlackDispatchResult = { type: "skipped" };
const failed = (error: Slack.SlackError): SlackDispatchResult => ({ type: "failed", error });

const describeSlackResult = (result: SlackDispatchResult): string =>
  match(result)
    .with({ type: "sent" }, () => "sent")
    .with({ type: "skipped" }, () => "skipped")
    .with({ type: "failed" }, ({ error }) => `failed (${format(error)})`)
    .exhaustive();

export interface NotifyDispatchResult {
  readonly rule: NotifyRule;
  // rule.message dopo la sostituzione dei placeholder (vedi ./template.ts) - il testo
  // effettivamente postato/emesso, non il template grezzo
  readonly message: string;
  readonly slack: SlackDispatchResult;
}

const dispatchSlack = (channel: string, message: string, ctx: NotifyContext): T.Task<SlackDispatchResult> =>
  pipe(
    ctx.slack,
    O.match(
      () =>
        pipe(
          T.fromIO(ctx.logger.debug(`notify: slack target skipped (not configured/active) - channel ${channel}`)),
          T.map(() => skipped),
        ),
      (slackConfig) =>
        pipe(
          Slack.postMessage(slackConfig, { channel, text: message }),
          TE.orElseFirstIOK((error) => ctx.logger.error(`notify: slack dispatch failed - ${format(error)}`)),
          TE.match(failed, () => sent),
        ),
    ),
  );

const dispatchRule = (
  rule: NotifyRule,
  lifecycle: NotifyLifecycle,
  vars: Readonly<Record<string, string>>,
  ctx: NotifyContext,
): T.Task<NotifyDispatchResult> => {
  const message = Template.render(rule.message.message, vars);

  return pipe(
    dispatchSlack(rule.channel, message, ctx),
    T.tapIO((slack) =>
      ctx.logger.info(`notify[${lifecycle}] slack dispatch ${describeSlackResult(slack)} - channel ${rule.channel}`),
    ),
    T.map((slack) => ({ rule, message, slack })),
  );
};

export const dispatch = (
  rules: readonly NotifyRule[],
  lifecycle: NotifyLifecycle,
  vars: Readonly<Record<string, string>>,
  ctx: NotifyContext,
): T.Task<readonly NotifyDispatchResult[]> =>
  pipe(
    rules.filter((rule) => rule.policy.includes(lifecycle)),
    T.traverseArray((rule) => dispatchRule(rule, lifecycle, vars, ctx)),
  );
