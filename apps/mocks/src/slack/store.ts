import type { SlackMessage } from "@supervisor/core/adapters/slack";

// -------------------------------------------------------------------------------------
// Stored message (with server-generated fields)
// -------------------------------------------------------------------------------------

export interface StoredSlackMessage extends SlackMessage {
  readonly timestamp: string;
}

// -------------------------------------------------------------------------------------
// Store
// -------------------------------------------------------------------------------------

export class SlackStore {
  messages: StoredSlackMessage[] = [];

  reset = () => {
    this.messages = [];
  };

  addMessage = (channel: string, text: string, blocks?: SlackMessage["blocks"]): StoredSlackMessage => {
    const msg: StoredSlackMessage = {
      channel,
      text,
      blocks,
      timestamp: `${Date.now()}.${String(this.messages.length).padStart(6, "0")}`,
    };
    this.messages.push(msg);
    return msg;
  };

  getMessages = (channel?: string): StoredSlackMessage[] => {
    if (!channel) return this.messages;
    return this.messages.filter((m) => m.channel === channel);
  };
}
