import crypto from "crypto";

export type JwtPayload = {
  exp: number;
  iat: number;
  nbf: number;
  jti: string;
  iss?: string;
  sub?: string;
  name?: string;
  [key: string]: unknown;
};

export function signJwt(payload: JwtPayload, privateKeyPem: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${base64UrlEncode(
    JSON.stringify(header)
  )}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKeyPem
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export function buildInvitePayload(
  name: string,
  userId: number,
  issuer: string,
  ttlSeconds: number
): JwtPayload {
  const now = Math.floor(Date.now() / 1000);
  return {
    exp: now + ttlSeconds,
    iat: now,
    nbf: now,
    iss: issuer,
    sub: `telegram:${userId}`,
    name,
    jti: crypto.randomUUID()
  };
}

function base64UrlEncode(input: Buffer | string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
