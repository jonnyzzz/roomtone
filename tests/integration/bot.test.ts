import crypto from "crypto";
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
};

describe("Telegram bot integration", () => {
  let baseUrl = "";
  let server: ReturnType<typeof createServer> | null = null;
  const sentMessages: SentMessage[] = [];
  let updates: TelegramUpdate[] = [];
  let updatesServed = false;

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
        sentMessages.push({
          chat_id: payload.chat_id,
          text: payload.text
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: {} }));
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
          text: "/invite",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 200, type: "private" }
        }
      },
      {
        update_id: 3,
        message: {
          message_id: 3,
          text: "/invite@roomtone_bot",
          from: { id: 42, first_name: "Ada", last_name: "Lovelace" },
          chat: { id: 300, type: "group", title: "Roomtone" }
        }
      }
    ];
    updatesServed = false;
    sentMessages.length = 0;

    const config = loadBotConfig({
      BOT_ENABLED: "true",
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_ALLOWED_USERS: "42",
      BOT_PUBLIC_BASE_URL: "https://roomtone.example",
      BOT_JWT_PRIVATE_KEY: privatePem,
      BOT_JWT_TTL_SECONDS: "300",
      BOT_JWT_ISSUER: "roomtone-telegram",
      TELEGRAM_API_BASE_URL: baseUrl
    } as NodeJS.ProcessEnv);

    expect(config).not.toBeNull();
    const api = new TelegramApi(config!.token, config!.telegramApiBaseUrl);
    const bot = new ConnectionManagerBot(config!, api);

    await bot.pollOnce();

    expect(sentMessages).toHaveLength(3);
    const inviteMessages = sentMessages
      .map((message) => ({ message, token: extractToken(message.text) }))
      .filter((item): item is { message: SentMessage; token: string } => Boolean(item.token));
    expect(inviteMessages).toHaveLength(2);
    expect(inviteMessages[0].token).not.toBe(inviteMessages[1].token);

    const now = Math.floor(Date.now() / 1000);
    for (const invite of inviteMessages) {
      const result = verifyJwt(invite.token, [publicPem], now, 5);
      expect(result.ok).toBe(true);
      expect(result.claims?.name).toBe("Ada Lovelace");
      expect(typeof result.claims?.jti).toBe("string");
    }
  });
});

function extractToken(text: string): string | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) {
    return null;
  }
  const url = new URL(match[0]);
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
