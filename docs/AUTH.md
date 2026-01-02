# Authentication Specification

Roomtone can enforce authentication on every HTTP request and WebSocket
handshake. When enabled, the server only responds when a valid RS256 JWT is
present.

## Summary

- Tokens are JSON Web Tokens signed with RSA (RS256).
- Only the `exp` claim is required; `name` is optional.
- Tokens can be provided as:
  - `?token=...` query parameter
  - `Authorization: Bearer ...` header
  - Cookie (default `roomtone_auth`)
- When a token arrives via query or header, the server sets an HttpOnly cookie
  so subsequent static asset requests work without extra params.

## Required Claims

| Claim | Type | Required | Purpose |
| --- | --- | --- | --- |
| `exp` | number (unix seconds) | yes | Expiration time |
| `name` | string | no | Default display name prefilled in the UI |

The server validates:
- JWT format and RS256 signature
- `exp` with optional clock skew

Other claims (issuer, audience, etc) are currently ignored.

## Configuration

Enable auth and configure keys:

- `AUTH_ENABLED=true`
- `AUTH_PUBLIC_KEYS` (inline PEM, supports multiple keys)
- or `AUTH_PUBLIC_KEYS_FILE` (PEM file with one or more keys)
- `AUTH_COOKIE_NAME` (default `roomtone_auth`)
- `AUTH_CLOCK_SKEW_SECONDS` (default `30`)

When auth is enabled, all endpoints, including `/health`, require a valid token.
If you use Docker healthchecks, set `AUTH_HEALTH_TOKEN` to a valid JWT.

## Generate RSA 4096 Keys

```bash
openssl genrsa -out roomtone.key 4096
openssl rsa -in roomtone.key -pubout -out roomtone.pub
```

Then set:

```bash
export AUTH_PUBLIC_KEYS_FILE=./roomtone.pub
export AUTH_ENABLED=true
```

## Create a Presigned URL (Node.js)

```bash
node <<'NODE'
import crypto from "crypto";
import fs from "fs";

const privateKey = fs.readFileSync("roomtone.key", "utf8");
const expiresInSeconds = 60 * 60;
const payload = {
  exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  name: "Ada Lovelace"
};
const header = { alg: "RS256", typ: "JWT" };

const base64Url = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
  JSON.stringify(payload)
)}`;
const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
const token = `${signingInput}.${base64Url(signature)}`;
console.log(token);
NODE
```

Use it as a presigned URL:

```
https://your-host.example/?token=JWT_HERE
```

The UI will prefill the name if the token contains a `name` claim. The same
token is used for the WebSocket handshake.
