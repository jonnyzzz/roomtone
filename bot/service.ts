import { BotConfig } from "./config";
import { buildInvitePayload, signJwt } from "./jwt";
import { TelegramApi, TelegramUpdate } from "./telegram";

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 2000;

export class ConnectionManagerBot {
  private offset = 0;
  private running = false;

  constructor(
    private readonly config: BotConfig,
    private readonly api: TelegramApi
  ) {}

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (error) {
        console.error("Telegram bot error:", error);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  async pollOnce(): Promise<number> {
    const updates = await this.api.getUpdates(
      this.offset,
      POLL_TIMEOUT_SECONDS
    );
    for (const update of updates) {
      this.offset = Math.max(this.offset, update.update_id + 1);
      await this.handleUpdate(update);
    }
    return updates.length;
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) {
      return;
    }
    if (!isCommand(message.text, this.config.command)) {
      return;
    }
    const sender = message.from;
    if (!sender) {
      return;
    }
    if (!this.config.allowedUsers.has(sender.id)) {
      if (message.chat.type === "private") {
        await this.api.sendMessage(message.chat.id, "Not authorized.");
      }
      return;
    }
    if (this.config.allowedChats && !this.config.allowedChats.has(message.chat.id)) {
      return;
    }

    const name = formatName(sender);
    const payload = buildInvitePayload(
      name,
      sender.id,
      this.config.jwtIssuer,
      this.config.jwtTtlSeconds
    );
    const token = signJwt(payload, this.config.jwtPrivateKey);
    const inviteUrl = new URL(this.config.publicBaseUrl.toString());
    inviteUrl.searchParams.set("token", token);

    const minutes = Math.ceil(this.config.jwtTtlSeconds / 60);
    const reply = `Here is your Roomtone invite link (valid for ${minutes} min): ${inviteUrl.toString()}`;
    await this.api.sendMessage(message.chat.id, reply);
  }
}

function isCommand(text: string, command: string): boolean {
  const token = text.trim().split(/\s+/)[0];
  const commandOnly = token.split("@")[0];
  return commandOnly === command;
}

function formatName(user: { first_name: string; last_name?: string; username?: string; id: number }): string {
  const raw =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    String(user.id);
  return raw.replace(/\s+/g, " ").trim().slice(0, 40);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
