import { AccessStore } from "./access";
import { BotConfig } from "./config";
import {
  buildAnonymousInvitePayload,
  buildInvitePayload,
  buildServicePayload,
  signJwt
} from "./jwt";
import { TelegramApi, TelegramChat, TelegramUpdate, TelegramUser } from "./telegram";

const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 2000;

export class ConnectionManagerBot {
  private offset = 0;
  private running = false;
  private access: AccessStore;
  private knownParticipants = new Map<string, string>();
  private hasParticipantBaseline = false;
  private serviceToken: { token: string; exp: number } | null = null;
  private deleteTimers = new Set<NodeJS.Timeout>();

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
    if (this.config.notifyChats.size > 0) {
      void this.notifyLoop();
    }
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
    for (const timer of this.deleteTimers) {
      clearTimeout(timer);
    }
    this.deleteTimers.clear();
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

  async checkParticipantsOnce(): Promise<number> {
    if (this.config.notifyChats.size === 0) {
      return 0;
    }
    const participants = await this.fetchParticipants();
    const current = new Map<string, string>();
    participants.forEach((participant) => {
      current.set(participant.id, participant.name);
    });

    if (!this.hasParticipantBaseline) {
      this.hasParticipantBaseline = true;
      this.knownParticipants = current;
      return 0;
    }

    const newcomers: { id: string; name: string }[] = [];
    for (const participant of participants) {
      if (!this.knownParticipants.has(participant.id)) {
        newcomers.push(participant);
      }
    }
    this.knownParticipants = current;

    for (const participant of newcomers) {
      await this.notifyParticipantJoined(participant.name);
    }

    return newcomers.length;
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) {
      return;
    }
    const isPrivate = message.chat.type === "private";
    const mention = isDirectMention(message.text, this.config.botUsername);
    const parsed = parseCommand(message.text);
    const sender = message.from;
    if (!sender) {
      return;
    }

    if (!parsed) {
      if (isPrivate || mention) {
        await this.api.sendMessage(
          message.chat.id,
          buildHelpMessage(this.config)
        );
      }
      return;
    }

    if (!isCommandForBot(parsed.mention, this.config.botUsername)) {
      return;
    }

    const command = parsed.command;
    const args = parsed.args;

    if (command === "/start") {
      await this.api.sendMessage(message.chat.id, buildHelpMessage(this.config));
      return;
    }

    if (command === "/whoami") {
      await sendWhoAmI(this.api, message.chat, sender);
      return;
    }

    if (isAdminCommand(command)) {
      await this.handleAdminCommand(command, args, sender, message.chat);
      return;
    }

    if (command !== this.config.command) {
      if (isPrivate || parsed.mention) {
        await this.api.sendMessage(
          message.chat.id,
          buildHelpMessage(this.config)
        );
      }
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

    const payload = buildInvitePayload(
      sender.id,
      this.config.jwtIssuer,
      this.config.jwtTtlSeconds
    );
    const token = signJwt(payload, this.config.jwtPrivateKey);
    const inviteUrl = new URL(this.config.publicBaseUrl.toString());
    inviteUrl.searchParams.delete("name");
    inviteUrl.searchParams.set("token", token);

    const minutes = Math.ceil(this.config.jwtTtlSeconds / 60);
    const reply = buildInviteMessage(inviteUrl.toString(), minutes);
    const sent = await this.api.sendMessage(message.chat.id, reply, {
      parseMode: "HTML"
    });
    this.scheduleDelete(message.chat.id, sent.message_id);
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

  private async notifyLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.checkParticipantsOnce();
      } catch (error) {
        console.error("Telegram notify error:", error);
      }
      await delay(this.config.notifyPollSeconds * 1000);
    }
  }

  private async fetchParticipants(): Promise<{ id: string; name: string }[]> {
    const url = new URL("/participants", this.config.serverBaseUrl);
    const token = this.getServiceToken();
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Participants request failed: ${response.status}`);
    }
    const data = (await response.json()) as { id: string; name: string }[];
    if (!Array.isArray(data)) {
      return [];
    }
    return data.filter(
      (item) => typeof item?.id === "string" && typeof item?.name === "string"
    );
  }

  private getServiceToken(): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.serviceToken && this.serviceToken.exp - now > 30) {
      return this.serviceToken.token;
    }
    const payload = buildServicePayload(
      this.config.jwtIssuer,
      this.config.jwtTtlSeconds
    );
    const token = signJwt(payload, this.config.jwtPrivateKey);
    this.serviceToken = { token, exp: payload.exp };
    return token;
  }

  private async notifyParticipantJoined(name: string): Promise<void> {
    const token = signJwt(
      buildAnonymousInvitePayload(
        this.config.jwtIssuer,
        this.config.jwtTtlSeconds
      ),
      this.config.jwtPrivateKey
    );
    const inviteUrl = new URL(this.config.publicBaseUrl.toString());
    inviteUrl.searchParams.delete("name");
    inviteUrl.searchParams.set("token", token);
    const message = buildJoinNotification(name, inviteUrl.toString());
    for (const chatId of this.config.notifyChats) {
      const sent = await this.api.sendMessage(chatId, message, {
        parseMode: "HTML"
      });
      this.scheduleDelete(chatId, sent.message_id);
    }
  }

  private scheduleDelete(chatId: number, messageId: number): void {
    const ttlSeconds = this.config.jwtTtlSeconds;
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      return;
    }
    const delayMs = ttlSeconds * 1000;
    const timer = setTimeout(() => {
      this.deleteTimers.delete(timer);
      void this.deleteInviteMessage(chatId, messageId);
    }, delayMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
    this.deleteTimers.add(timer);
  }

  private async deleteInviteMessage(
    chatId: number,
    messageId: number
  ): Promise<void> {
    try {
      await this.api.deleteMessage(chatId, messageId);
    } catch (error) {
      console.warn("Failed to delete invite message:", error);
    }
  }
}

function parseCommand(
  text: string
): { command: string; args: string[]; mention?: string } | null {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length === 0) {
    return null;
  }
  const commandToken = tokens[0];
  if (!commandToken.startsWith("/")) {
    return null;
  }
  const [commandPart, mentionPart] = commandToken.split("@");
  const command = commandPart.toLowerCase();
  const mention = mentionPart ? mentionPart.toLowerCase() : undefined;
  return { command, args: tokens.slice(1), mention };
}

function isCommandForBot(
  mention: string | undefined,
  botUsername: string | null
): boolean {
  if (!mention) {
    return true;
  }
  if (!botUsername) {
    return false;
  }
  return mention === botUsername;
}

function isDirectMention(text: string, botUsername: string | null): boolean {
  if (!botUsername) {
    return false;
  }
  const normalized = `@${botUsername}`.toLowerCase();
  return text.toLowerCase().includes(normalized);
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

function buildHelpMessage(config: BotConfig): string {
  const invite = config.command;
  return [
    "Roomtone bot commands:",
    `${invite} - get a 5-minute invite link`,
    "/whoami - show your Telegram user/chat IDs",
    "/allow_user <id> - allow a user (admin)",
    "/deny_user <id> - remove a user (admin)",
    "/allow_chat <id> - allow a group chat (admin)",
    "/deny_chat <id> - remove a group chat (admin)",
    "/list_access - show allowlist (admin)"
  ].join("\n");
}

function buildJoinNotification(name: string, url: string): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(url);
  return [
    `New participant: <b>${safeName}</b>`,
    `<a href="${safeUrl}">Join the Call...</a>`
  ].join("\n");
}

function buildInviteMessage(url: string, minutes: number): string {
  const safeUrl = escapeHtml(url);
  return [
    `Invite link (valid for ${minutes} min):`,
    `<a href="${safeUrl}">Join the Call...</a>`
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
