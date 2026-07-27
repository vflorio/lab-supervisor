import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { type AppError, of } from "../errors";
import { type HTTPError, postJsonBearer } from "../http";

// -------------------------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://slack.com/api";

export interface SlackConfig {
  readonly botToken: string;
  readonly baseUrl?: string;
}

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface SlackMessage {
  readonly channel: string;
  readonly text: string;
  readonly blocks?: readonly SlackBlock[];
}

export interface SlackBlock {
  readonly type: "section";
  readonly text: { readonly type: "mrkdwn" | "plain_text"; readonly text: string };
}

// -------------------------------------------------------------------------------------
// Validation
// -------------------------------------------------------------------------------------

export interface SlackAPIError extends AppError<"SlackAPIError"> {}

export type SlackError = HTTPError | SlackAPIError;

interface SlackOkResponse {
  readonly ok: true;
}

interface SlackErrorResponse {
  readonly ok: false;
  readonly error: string;
}

type SlackResponse = SlackOkResponse | SlackErrorResponse;

const isValidResponse = (u: unknown): u is SlackResponse =>
  typeof u === "object" && u !== null && "ok" in u && typeof (u as Record<string, unknown>).ok === "boolean";

// -------------------------------------------------------------------------------------
// API
// -------------------------------------------------------------------------------------

// Posta un messaggio su un canale Slack
export const postMessage = (config: SlackConfig, message: SlackMessage): TE.TaskEither<SlackError, void> =>
  pipe(
    postJsonBearer(`${config.baseUrl ?? DEFAULT_BASE_URL}/chat.postMessage`, { token: config.botToken }, message),
    TE.flatMap((response) => {
      if (!isValidResponse(response)) {
        return TE.left(of("SlackAPIError")("invalid_response"));
      }
      return response.ok ? TE.right(undefined) : TE.left(of("SlackAPIError")(response.error));
    }),
  );
