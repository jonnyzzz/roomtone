import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { createServer } from "http";
import { once } from "events";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { loadBotConfig } from "../../bot/config";
import { ConnectionManagerBot } from "../../bot/service";
import { TelegramApi, TelegramUpdate } from "../../bot/telegram";
import { verifyJwt } from "../../server/auth";

type SentMessage = {
  chat_id: number;
  text: string;
  parse_mode?: string;
  message_id: number;
};

type DeletedMessage = {
  chat_id: number;
  message_id: number;
};

describe("Telegram bot integration", () => {
  let baseUrl = "";
  let server: ReturnType<typeof createServer> | null = null;
  const sentMessages: SentMessage[] = [];
  const deletedMessages: DeletedMessage[] = [];
  let updates: TelegramUpdate[] = [];
  let updatesServed = false;
  let participantSnapshots: { id: string; name: string }[][] = [];
  let participantIndex = 0;
  let nextMessageId = 1000;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const url = req.url ?? "";
      const body = await readBody(req);
      if (url.includes("/getUpdates")) {
        const response = {
          ok: true,
          result: updatesServed ? [] : updates
        };
        updatesServed = true;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }
      if (url.includes("/sendMessage")) {
        const payload = body ? JSON.parse(body) : {};
        const messageId = nextMessageId++;
        sentMessages.push({
          chat_id: payload.chat_id,
          text: payload.text,
          parse_mode: payload.parse_mode,
          message_id: messageId
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            result: {
              message_id: messageId,
              chat: { id: payload.chat_id, type: "private" }
            }
          })
        );
        return;
      }
      if (url.includes("/deleteMessage")) {
        const payload = body ? JSON.parse(body) : {};
        deletedMessages.push({
          chat_id: payload.chat_id,
          message_id: payload.message_id
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: true }));
        return;
      }
      if (url.includes("/participants")) {
        const snapshot =
          participantSnapshots[participantIndex] ??
          participantSnapshots[participantSnapshots.length - 1] ??
          [];
        participantIndex += 1;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(snapshot));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server?.listen(0, resolve));
    const address = server?.address();
    if (address && typeof address !== "string") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(async () => {
    if (!server) {
      return;
    }
    server.close();
    await once(server, "close");
  });

  it("issues invite links for allowed users in private and group chats", async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const privatePem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    updates = [
      {
        update_id: 1,
        message: {
          message_id: 1,
          text: "/invite",
          from: { id: 7, first_name: "Eve" },
          chat: { id: 100, type: "private" }
        }
      },
      {
        update_id: 2,
        message: {
          message_id: 2,
          text: "/allow_user 7",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 200, type: "private" }
        }
      },
      {
        update_id: 3,
        message: {
          message_id: 3,
          text: "/allow_chat 300",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 200, type: "private" }
        }
      },
      {
        update_id: 4,
        message: {
          message_id: 4,
          text: "/invite",
          from: { id: 7, first_name: "Eve" },
          chat: { id: 100, type: "private" }
        }
      },
      {
        update_id: 5,
        message: {
          message_id: 5,
          text: "/invite",
          from: { id: 7, first_name: "Eve" },
          chat: { id: 300, type: "group", title: "Roomtone" }
        }
      }
    ];
    updatesServed = false;
    sentMessages.length = 0;
    deletedMessages.length = 0;
    nextMessageId = 1000;

    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-bot-"));
    const stateFile = path.join(stateDir, "bot-access.json");
    const config = loadBotConfig({
      BOT_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ALLOWED_USERS: "42",
      TELEGRAM_ADMIN_USERS: "42",
      TELEGRAM_ALLOWED_CHATS: "300",
      TELEGRAM_BOT_USERNAME: "roomtone_bot",
      PUBLIC_BASE_URL: "https://roomtone.example",
      BOT_JWT_PRIVATE_KEY: privatePem,
      BOT_JWT_TTL_SECONDS: "300",
      BOT_JWT_ISSUER: "roomtone-telegram",
      TELEGRAM_API_BASE_URL: baseUrl,
      BOT_STATE_FILE: stateFile
    } as NodeJS.ProcessEnv);

    expect(config).not.toBeNull();
    const api = new TelegramApi(config!.token, config!.telegramApiBaseUrl);
    const bot = new ConnectionManagerBot(config!, api);

    await bot.pollOnce();

    expect(sentMessages).toHaveLength(5);
    expect(sentMessages[0].text).toBe("Not authorized.");
    expect(sentMessages[1].text).toBe("User 7 allowed.");
    expect(sentMessages[2].text).toBe("Chat 300 allowed.");

    const inviteMessages = sentMessages
      .map((message) => ({ message, token: extractToken(message.text) }))
      .filter((item): item is { message: SentMessage; token: string } => Boolean(item.token));
    expect(inviteMessages).toHaveLength(2);
    expect(inviteMessages[0].token).not.toBe(inviteMessages[1].token);

    const now = Math.floor(Date.now() / 1000);
    for (const invite of inviteMessages) {
      const result = verifyJwt(invite.token, [publicPem], now, 5);
      expect(result.ok).toBe(true);
      expect(result.claims?.name).toBe("Eve");
      expect(typeof result.claims?.jti).toBe("string");
    }
  });

  it("removes expired invite links", async () => {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const privatePem = privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    updates = [
      {
        update_id: 20,
        message: {
          message_id: 20,
          text: "/invite",
          from: { id: 7, first_name: "Eve" },
          chat: { id: 101, type: "private" }
        }
      }
    ];
    updatesServed = false;
    sentMessages.length = 0;
    deletedMessages.length = 0;
    nextMessageId = 1000;

    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-bot-"));
    const stateFile = path.join(stateDir, "bot-access.json");
    const config = loadBotConfig({
      BOT_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ALLOWED_USERS: "7",
      TELEGRAM_BOT_USERNAME: "roomtone_bot",
      PUBLIC_BASE_URL: "https://roomtone.example",
      BOT_JWT_PRIVATE_KEY: privatePem,
      BOT_JWT_TTL_SECONDS: "1",
      TELEGRAM_API_BASE_URL: baseUrl,
      BOT_STATE_FILE: stateFile
    } as NodeJS.ProcessEnv);

    expect(config).not.toBeNull();
    const api = new TelegramApi(config!.token, config!.telegramApiBaseUrl);
    const bot = new ConnectionManagerBot(config!, api);

    await bot.pollOnce();

    expect(sentMessages).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(deletedMessages).toHaveLength(1);
    expect(deletedMessages[0]).toEqual({
      chat_id: sentMessages[0].chat_id,
      message_id: sentMessages[0].message_id
    });
    bot.stop();
  });

  it("responds with help for unknown DMs and direct mentions", async () => {
    updates = [
      {
        update_id: 10,
        message: {
          message_id: 10,
          text: "hello bot",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 400, type: "private" }
        }
      },
      {
        update_id: 11,
        message: {
          message_id: 11,
          text: "/start",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 400, type: "private" }
        }
      },
      {
        update_id: 12,
        message: {
          message_id: 12,
          text: "hello @roomtone_bot",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 500, type: "group", title: "Roomtone" }
        }
      },
      {
        update_id: 13,
        message: {
          message_id: 13,
          text: "hello everyone",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 500, type: "group", title: "Roomtone" }
        }
      }
    ];
    updatesServed = false;
    sentMessages.length = 0;
    deletedMessages.length = 0;
    nextMessageId = 1000;

    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-bot-"));
    const stateFile = path.join(stateDir, "bot-access.json");
    const config = loadBotConfig({
      BOT_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ADMIN_USERS: "42",
      TELEGRAM_BOT_USERNAME: "roomtone_bot",
      PUBLIC_BASE_URL: "https://roomtone.example",
      BOT_JWT_PRIVATE_KEY: crypto
        .generateKeyPairSync("rsa", { modulusLength: 2048 })
        .privateKey.export({ type: "pkcs8", format: "pem" })
        .toString(),
      TELEGRAM_API_BASE_URL: baseUrl,
      BOT_STATE_FILE: stateFile
    } as NodeJS.ProcessEnv);

    expect(config).not.toBeNull();
    const api = new TelegramApi(config!.token, config!.telegramApiBaseUrl);
    const bot = new ConnectionManagerBot(config!, api);

    await bot.pollOnce();

    expect(sentMessages).toHaveLength(3);
    sentMessages.forEach((message) => {
      expect(message.text).toContain("Roomtone bot commands");
    });
  });

  it("notifies when new participants join", async () => {
    participantSnapshots = [
      [{ id: "p1", name: "Alice" }],
      [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" }
      ],
      [
        { id: "p1", name: "Alice" },
        { id: "p2", name: "Bob" }
      ]
    ];
    participantIndex = 0;
    sentMessages.length = 0;
    deletedMessages.length = 0;
    nextMessageId = 1000;

    const keyPair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePem = keyPair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString();

    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-bot-"));
    const stateFile = path.join(stateDir, "bot-access.json");
    const config = loadBotConfig({
      BOT_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ADMIN_USERS: "42",
      TELEGRAM_NOTIFY_CHATS: "900",
      PUBLIC_BASE_URL: baseUrl,
      BOT_JWT_PRIVATE_KEY: privatePem,
      TELEGRAM_API_BASE_URL: baseUrl,
      BOT_STATE_FILE: stateFile
    } as NodeJS.ProcessEnv);

    expect(config).not.toBeNull();
    const api = new TelegramApi(config!.token, config!.telegramApiBaseUrl);
    const bot = new ConnectionManagerBot(config!, api);

    await bot.checkParticipantsOnce();
    await bot.checkParticipantsOnce();
    await bot.checkParticipantsOnce();

    expect(sentMessages).toHaveLength(1);
    const message = sentMessages[0];
    expect(message.chat_id).toBe(900);
    expect(message.parse_mode).toBe("HTML");
    expect(message.text).toContain("Bob");
    expect(message.text).toContain(`<a href="${baseUrl}/?token=`);
    expect(message.text).toContain(">Join the Call...</a>");
  });
});

function extractToken(text: string): string | null {
  const hrefMatch = text.match(/href="([^"]+)"/) ?? text.match(/href='([^']+)'/);
  const rawUrl = hrefMatch ? hrefMatch[1] : text.match(/https?:\/\/\S+/)?.[0];
  if (!rawUrl) {
    return null;
  }
  const url = new URL(rawUrl);
  return url.searchParams.get("token");
}

function readBody(req: { on: (event: string, cb: (chunk?: any) => void) => void }): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}
