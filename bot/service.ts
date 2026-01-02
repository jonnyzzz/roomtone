import { AccessStore } from "./access";
import { BotConfig } from "./config";
import { buildInvitePayload, signJwt } from "./jwt";
import { TelegramApi, TelegramChat, TelegramUpdate, TelegramUser } from "./telegram";

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 2000;

export class ConnectionManagerBot {
  private offset = 0;
  private running = false;
  private access: AccessStore;

  constructor(
    private readonly config: BotConfig,
    private readonly api: TelegramApi,
    accessStore?: AccessStore
  ) {
    this.access = accessStore ?? AccessStore.load(config);
  }

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
    const parsed = parseCommand(message.text);
    if (!parsed) {
      return;
    }
    const sender = message.from;
    if (!sender) {
      return;
    }

    const command = parsed.command;
    const args = parsed.args;

    if (command === "/whoami") {
      await sendWhoAmI(this.api, message.chat, sender);
      return;
    }

    if (isAdminCommand(command)) {
      await this.handleAdminCommand(command, args, sender, message.chat);
      return;
    }

    if (command !== this.config.command) {
      return;
    }

    if (!this.access.isAllowedUser(sender)) {
      if (message.chat.type === "private") {
        await this.api.sendMessage(message.chat.id, "Not authorized.");
      }
      return;
    }
    if (!this.access.isChatAllowed(message.chat)) {
      if (message.chat.type === "private") {
        await this.api.sendMessage(message.chat.id, "Chat not allowlisted.");
      }
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

  private async handleAdminCommand(
    command: string,
    args: string[],
    sender: TelegramUser,
    chat: TelegramChat
  ): Promise<void> {
    if (!this.access.isAdmin(sender)) {
      if (chat.type === "private") {
        await this.api.sendMessage(chat.id, "Not authorized.");
      }
      return;
    }

    const id = parseNumericArg(args[0]);
    if (command === "/allow_user") {
      if (!id) {
        await this.api.sendMessage(chat.id, "Usage: /allow_user <telegram_id>");
        return;
      }
      this.access.allowUser(id);
      await this.api.sendMessage(chat.id, `User ${id} allowed.`);
      return;
    }
    if (command === "/deny_user") {
      if (!id) {
        await this.api.sendMessage(chat.id, "Usage: /deny_user <telegram_id>");
        return;
      }
      this.access.denyUser(id);
      await this.api.sendMessage(chat.id, `User ${id} removed.`);
      return;
    }
    if (command === "/allow_chat") {
      if (!id) {
        await this.api.sendMessage(chat.id, "Usage: /allow_chat <chat_id>");
        return;
      }
      this.access.allowChat(id);
      await this.api.sendMessage(chat.id, `Chat ${id} allowed.`);
      return;
    }
    if (command === "/deny_chat") {
      if (!id) {
        await this.api.sendMessage(chat.id, "Usage: /deny_chat <chat_id>");
        return;
      }
      this.access.denyChat(id);
      await this.api.sendMessage(chat.id, `Chat ${id} removed.`);
      return;
    }
    if (command === "/list_access") {
      await this.api.sendMessage(chat.id, this.access.summary());
    }
  }
}

function parseCommand(text: string): { command: string; args: string[] } | null {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length === 0) {
    return null;
  }
  const commandToken = tokens[0];
  if (!commandToken.startsWith("/")) {
    return null;
  }
  const command = commandToken.split("@")[0];
  return { command, args: tokens.slice(1) };
}

function formatName(user: { first_name: string; last_name?: string; username?: string; id: number }): string {
  const raw =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.username ||
    String(user.id);
  return raw.replace(/\s+/g, " ").trim().slice(0, 40);
}

function parseNumericArg(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function isAdminCommand(command: string): boolean {
  return (
    command === "/allow_user" ||
    command === "/deny_user" ||
    command === "/allow_chat" ||
    command === "/deny_chat" ||
    command === "/list_access"
  );
}

async function sendWhoAmI(
  api: TelegramApi,
  chat: TelegramChat,
  user: TelegramUser
): Promise<void> {
  const username = user.username ? `@${user.username}` : "unknown";
  const text = [
    `User ID: ${user.id}`,
    `Username: ${username}`,
    `Chat ID: ${chat.id}`,
    `Chat type: ${chat.type}`
  ].join("\n");
  await api.sendMessage(chat.id, text);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
