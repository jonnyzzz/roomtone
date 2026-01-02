import crypto from "crypto";
import { describe, expect, it } from "vitest";
import {
  extractPemBlocks,
  getTokenFromRequest,
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
});
