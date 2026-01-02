import crypto from "crypto";
import fs from "fs";

export type BotConfig = {
  token: string;
  allowedUsers: Set<number>;
  allowedChats: Set<number> | null;
  adminUsers: Set<number>;
  adminUsernames: Set<string>;
  botUsername: string | null;
  notifyChats: Set<number>;
  notifyPollSeconds: number;
  serverBaseUrl: URL;
  command: string;
  publicBaseUrl: URL;
  jwtPrivateKey: string;
  jwtTtlSeconds: number;
  jwtIssuer: string;
  telegramApiBaseUrl: string;
  stateFile: string;
};

const MIN_RSA_BITS = 2048;

export function loadBotConfig(env: NodeJS.ProcessEnv): BotConfig | null {
  if (env.BOT_ENABLED !== "true") {
    return null;
  }

  const token = requireValue(env.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  const allowedUsers = parseIdList(
    env.TELEGRAM_ALLOWED_USERS ?? ""
  );
  const adminUsers = parseIdList(env.TELEGRAM_ADMIN_USERS ?? "");
  const adminUsernames = parseUsernameList(env.TELEGRAM_ADMIN_USERNAMES ?? "");
  if (allowedUsers.size === 0 && adminUsers.size === 0 && adminUsernames.size === 0) {
    throw new Error(
      "TELEGRAM_ALLOWED_USERS or TELEGRAM_ADMIN_USERS must include at least one entry."
    );
  }

  const allowedChats = parseOptionalIdList(env.TELEGRAM_ALLOWED_CHATS);
  const notifyChats = resolveNotifyChats(env, allowedChats);
  const notifyPollSeconds = parsePositiveInt(
    env.BOT_NOTIFY_POLL_SECONDS,
    10,
    "BOT_NOTIFY_POLL_SECONDS"
  );
  const botUsername = normalizeUsername(env.TELEGRAM_BOT_USERNAME);
  const commandRaw = env.BOT_COMMAND?.trim() || "/invite";
  const command = (commandRaw.startsWith("/") ? commandRaw : `/${commandRaw}`)
    .toLowerCase();

  const baseUrlRaw = resolveBaseUrl(env);
  if (!baseUrlRaw) {
    throw new Error(
      "PUBLIC_BASE_URL (or DYNDNS_DOMAIN + ROOMTONE_SUBDOMAIN) is required."
    );
  }
  const publicBaseUrl = new URL(baseUrlRaw);
  const serverBaseUrl = new URL(publicBaseUrl.toString());

  const jwtPrivateKey = loadPrivateKey(env);
  const jwtTtlSeconds = parsePositiveInt(
    env.BOT_JWT_TTL_SECONDS,
    300,
    "BOT_JWT_TTL_SECONDS"
  );
  const jwtIssuer = env.BOT_JWT_ISSUER?.trim() || "roomtone-telegram";
  const telegramApiBaseUrl =
    env.TELEGRAM_API_BASE_URL?.trim() || "https://api.telegram.org";
  const stateFile =
    env.BOT_STATE_FILE?.trim() || "/var/lib/roomtone/bot-access.json";

  return {
    token,
    allowedUsers,
    allowedChats,
    adminUsers,
    adminUsernames,
    botUsername,
    notifyChats,
    notifyPollSeconds,
    serverBaseUrl,
    command,
    publicBaseUrl,
    jwtPrivateKey,
    jwtTtlSeconds,
    jwtIssuer,
    telegramApiBaseUrl,
    stateFile
  };
}

function parseIdList(raw: string): Set<number> {
  const result = new Set<number>();
  raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const value = Number(part);
      if (Number.isFinite(value)) {
        result.add(value);
      }
    });
  return result;
}

function parseUsernameList(raw: string): Set<string> {
  const result = new Set<string>();
  raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const normalized = part.replace(/^@/, "").toLowerCase();
      if (normalized) {
        result.add(normalized);
      }
    });
  return result;
}

function normalizeUsername(raw?: string): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().replace(/^@/, "").toLowerCase();
  return normalized ? normalized : null;
}

function parseOptionalIdList(raw?: string): Set<number> | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const parsed = parseIdList(raw);
  return parsed.size > 0 ? parsed : null;
}

function resolveNotifyChats(
  env: NodeJS.ProcessEnv,
  allowedChats: Set<number> | null
): Set<number> {
  const raw = env.TELEGRAM_NOTIFY_CHATS?.trim();
  if (raw) {
    return parseIdList(raw);
  }
  return allowedChats ? new Set(allowedChats) : new Set<number>();
}

function requireValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required.`);
  }
  return trimmed;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return Math.floor(value);
}

function loadPrivateKey(env: NodeJS.ProcessEnv): string {
  const inlineKey = env.BOT_JWT_PRIVATE_KEY?.trim();
  const keyFile = env.BOT_JWT_PRIVATE_KEY_FILE?.trim();
  let pem = inlineKey;

  if (!pem && keyFile) {
    pem = fs.readFileSync(keyFile, "utf8");
  }

  if (!pem) {
    throw new Error(
      "BOT_JWT_PRIVATE_KEY or BOT_JWT_PRIVATE_KEY_FILE must be set."
    );
  }

  const key = validatePrivateKey(pem);
  if (!key) {
    throw new Error("BOT_JWT_PRIVATE_KEY must be a valid RSA key.");
  }

  return key;
}

function validatePrivateKey(pem: string): string | null {
  try {
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== "rsa") {
      return null;
    }
    const modulusLength = key.asymmetricKeyDetails?.modulusLength;
    if (modulusLength && modulusLength < MIN_RSA_BITS) {
      return null;
    }
    return key.export({ type: "pkcs8", format: "pem" }).toString();
  } catch {
    return null;
  }
}

function resolveBaseUrl(env: NodeJS.ProcessEnv): string | null {
  const direct = env.PUBLIC_BASE_URL?.trim();
  if (direct) {
    return direct;
  }

  const subdomain = env.ROOMTONE_SUBDOMAIN?.trim();
  const domain =
    env.DYNDNS_DOMAIN?.trim() ||
    readOptionalFile(env.DYNDNS_DOMAIN_FILE?.trim());
  if (subdomain && domain) {
    return `https://${subdomain}.${domain}`;
  }

  return null;
}

function readOptionalFile(pathValue?: string): string | null {
  if (!pathValue) {
    return null;
  }
  try {
    return fs.readFileSync(pathValue, "utf8").trim();
  } catch {
    return null;
  }
}
