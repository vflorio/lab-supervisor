import * as t from "io-ts";
import { match } from "ts-pattern";
import type { NotifyTarget, NotifyTemplateMessage } from "./model";

// Tupla taggata per il target: ["slack"], un solo branch oggi, stesso stampo delle altre
// tuple taggate per estendersi senza refactor (es. un futuro ["webhook", url]).

const isNotifyTarget = (u: unknown): u is NotifyTarget => typeof u === "object" && u !== null && "type" in u;

const validateNotifyTarget = (u: unknown, c: t.Context): t.Validation<NotifyTarget> => {
  if (!Array.isArray(u) || u.length === 0) return t.failure(u, c, "Expected: [tag, ...args]");

  const [tag] = u;
  if (typeof tag !== "string") return t.failure(u, c, "First element must be a string (notify target tag)");

  return match<string, t.Validation<NotifyTarget>>(tag)
    .with("slack", () => t.success({ type: "slack" as const }))
    .otherwise(() => t.failure(u, c, `Unknown notify target tag: "${tag}"`));
};

const encodeNotifyTarget = (target: NotifyTarget): unknown[] =>
  match(target)
    .with({ type: "slack" }, () => ["slack"])
    .exhaustive();

export const NotifyTargetCodec = new t.Type<NotifyTarget, unknown[], unknown>(
  "NotifyTarget",
  isNotifyTarget,
  validateNotifyTarget,
  encodeNotifyTarget,
);

export const NotifyLifecycleCodec = t.union([t.literal("immediate"), t.literal("exhausted")]);

// Wrap/unwrap: nessuna validazione di struttura da hardcodare, il JSON resta una stringa
// semplice, solo il tipo decodificato diventa l'ADT.
export const NotifyTemplateMessageCodec: t.Type<NotifyTemplateMessage, string, unknown> = new t.Type(
  "NotifyTemplateMessage",
  (u): u is NotifyTemplateMessage =>
    typeof u === "object" &&
    u !== null &&
    (u as NotifyTemplateMessage).type === "template" &&
    typeof (u as NotifyTemplateMessage).message === "string",
  (u, c) =>
    typeof u === "string"
      ? t.success({ type: "template", message: u })
      : t.failure(u, c, "Expected a string (notify message template)"),
  (a) => a.message,
);

export const NotifyRuleCodec = t.type({
  type: NotifyTargetCodec,
  channel: t.string,
  message: NotifyTemplateMessageCodec,
  policy: t.array(NotifyLifecycleCodec),
});
