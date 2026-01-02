import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildAuthCookie,
  buildClearCookie,
  extractPemBlocks,
  getTokenFromRequest,
  loadAuthConfig,
  verifyJwt
} from "../../server/auth";

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${base64UrlEncode(
    JSON.stringify(header)
  )}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

describe("auth", () => {
  it("verifies RS256 tokens and exposes claims", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now + 60, name: "Ada" }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(true);
    expect(result.claims?.name).toBe("Ada");
  });

  it("rejects expired tokens", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now - 5 }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token expired.");
  });

  it("accepts tokens within clock skew", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now - 5 }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 10);

    expect(result.ok).toBe(true);
  });

  it("rejects tokens that are not active yet", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now + 60, nbf: now + 120 }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token not active.");
  });

  it("rejects tokens issued in the future", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now + 60, iat: now + 120 }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token issued in the future.");
  });

  it("rejects tokens signed with a different key", () => {
    const keyA = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const keyB = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ exp: now + 60 }, keyA.privateKey);
    const publicPem = keyB.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token signature invalid.");
  });

  it("rejects tokens without exp", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const now = Math.floor(Date.now() / 1000);
    const token = signJwt({ name: "Ada" }, privateKey);
    const publicPem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const result = verifyJwt(token, [publicPem], now, 0);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Token exp missing.");
  });

  it("extracts tokens from headers, query, and cookies", () => {
    const headerResult = getTokenFromRequest(
      "/?token=query",
      { authorization: "Bearer header-token" },
      "roomtone_auth"
    );
    expect(headerResult).toEqual({
      token: "header-token",
      source: "header"
    });

    const queryResult = getTokenFromRequest(
      "/?token=query-token",
      {},
      "roomtone_auth"
    );
    expect(queryResult).toEqual({ token: "query-token", source: "query" });

    const cookieResult = getTokenFromRequest(
      "/",
      { cookie: "roomtone_auth=cookie-token" },
      "roomtone_auth"
    );
    expect(cookieResult).toEqual({ token: "cookie-token", source: "cookie" });
  });

  it("extracts multiple PEM blocks", () => {
    const keyA = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const keyB = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pemA = keyA.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const pemB = keyB.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    const blocks = extractPemBlocks(`${pemA}\n${pemB}`);

    expect(blocks).toEqual([pemA.trim(), pemB.trim()]);
  });

  it("loads auth config from a key file", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    const pem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roomtone-auth-"));
    const filePath = path.join(dir, "auth.pub");
    fs.writeFileSync(filePath, pem);

    const config = loadAuthConfig({
      AUTH_ENABLED: "true",
      AUTH_PUBLIC_KEYS_FILE: filePath,
      AUTH_COOKIE_NAME: "rt_auth",
      AUTH_CLOCK_SKEW_SECONDS: "15"
    });

    expect(config.enabled).toBe(true);
    expect(config.publicKeys).toHaveLength(1);
    expect(config.cookieName).toBe("rt_auth");
    expect(config.clockSkewSeconds).toBe(15);
  });

  it("rejects weak RSA public keys when enabled", () => {
    const { publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 1024
    });
    const pem = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();

    expect(() =>
      loadAuthConfig({
        AUTH_ENABLED: "true",
        AUTH_PUBLIC_KEYS: pem
      })
    ).toThrow("One or more AUTH_PUBLIC_KEYS are invalid or too weak.");
  });

  it("builds and clears auth cookies", () => {
    const cookie = buildAuthCookie("roomtone_auth", "token-value", 120, true);
    expect(cookie).toContain("roomtone_auth=token-value");
    expect(cookie).toContain("Max-Age=120");
    expect(cookie).toContain("Secure");

    const cleared = buildClearCookie("roomtone_auth", false);
    expect(cleared).toContain("roomtone_auth=");
    expect(cleared).toContain("Max-Age=0");
    expect(cleared).not.toContain("Secure");
  });
});
