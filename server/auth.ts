import crypto from "crypto";
import fs from "fs";
import { IncomingHttpHeaders } from "http";

export type AuthClaims = {
  exp: number;
  name?: string;
  [key: string]: unknown;
};

export type AuthConfig = {
  enabled: boolean;
  publicKeys: string[];
  cookieName: string;
  clockSkewSeconds: number;
};

export type TokenSource = "query" | "header" | "cookie";

export type TokenLookup = {
  token?: string;
  source?: TokenSource;
};

export function loadAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const enabled = env.AUTH_ENABLED === "true";
  const cookieName = env.AUTH_COOKIE_NAME?.trim() || "roomtone_auth";
  const clockSkewRaw = Number(env.AUTH_CLOCK_SKEW_SECONDS ?? "30");
  const clockSkewSeconds = Number.isFinite(clockSkewRaw)
    ? Math.max(0, clockSkewRaw)
    : 30;

  const keys: string[] = [];
  const inlineKeys = env.AUTH_PUBLIC_KEYS?.trim();
  if (inlineKeys) {
    keys.push(...extractPemBlocks(inlineKeys));
  }

  const keyFile = env.AUTH_PUBLIC_KEYS_FILE?.trim();
  if (keyFile) {
    const fileData = fs.readFileSync(keyFile, "utf8");
    keys.push(...extractPemBlocks(fileData));
  }

  return {
    enabled,
    publicKeys: keys,
    cookieName,
    clockSkewSeconds
  };
}

export function extractPemBlocks(input: string): string[] {
  const blocks: string[] = [];
  const pattern =
    /-----BEGIN (RSA )?PUBLIC KEY-----[\s\S]+?-----END (RSA )?PUBLIC KEY-----/g;
  const matches = input.match(pattern);
  if (!matches) {
    return blocks;
  }
  for (const match of matches) {
    blocks.push(match.trim());
  }
  return blocks;
}

export function getTokenFromRequest(
  url: string | undefined,
  headers: IncomingHttpHeaders,
  cookieName: string
): TokenLookup {
  const authHeader = headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return { token: authHeader.slice("bearer ".length).trim(), source: "header" };
  }

  if (url) {
    const parsed = new URL(url, "http://localhost");
    const token = parsed.searchParams.get("token");
    if (token) {
      return { token, source: "query" };
    }
  }

  const cookieHeader = headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token = cookies[cookieName];
    if (token) {
      return { token, source: "cookie" };
    }
  }

  return {};
}

export function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim();
    if (!key) {
      return;
    }
    const value = rest.join("=").trim();
    result[key] = decodeURIComponent(value);
  });
  return result;
}

export function verifyJwt(
  token: string,
  publicKeys: string[],
  nowSeconds: number,
  clockSkewSeconds: number
): { ok: boolean; claims?: AuthClaims; error?: string } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, error: "Token format invalid." };
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signingInput = `${headerSegment}.${payloadSegment}`;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlDecode(headerSegment));
    payload = JSON.parse(base64UrlDecode(payloadSegment));
  } catch {
    return { ok: false, error: "Token payload invalid." };
  }

  if (!header || header.alg !== "RS256") {
    return { ok: false, error: "Token algorithm not allowed." };
  }

  if (!payload || typeof payload.exp !== "number") {
    return { ok: false, error: "Token exp missing." };
  }

  if (payload.exp <= nowSeconds - clockSkewSeconds) {
    return { ok: false, error: "Token expired." };
  }

  const signature = base64UrlDecodeToBuffer(signatureSegment);
  const isValid = publicKeys.some((key) => {
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signingInput);
    verifier.end();
    try {
      return verifier.verify(key, signature);
    } catch {
      return false;
    }
  });

  if (!isValid) {
    return { ok: false, error: "Token signature invalid." };
  }

  return { ok: true, claims: payload as AuthClaims };
}

export function buildAuthCookie(
  cookieName: string,
  token: string,
  expiresInSeconds: number,
  secure: boolean
): string {
  const maxAge = Math.max(0, expiresInSeconds);
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function base64UrlDecode(input: string): string {
  return base64UrlDecodeToBuffer(input).toString("utf8");
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  return Buffer.from(padded, "base64");
}
