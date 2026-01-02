# Roomtone

Roomtone is a single-room audio and video calling app built on WebRTC and WebSocket signaling. It runs behind external HTTPS termination, works on mobile and desktop, and keeps signaling traffic on secure connections only.

## Highlights

- One shared room for all participants.
- WebRTC audio and video with WebSocket signaling.
- Clean, mobile-friendly UI in React + TypeScript.
- Docker-first deployment with a single container.
- Built-in integration tests (Playwright) and unit tests (Vitest).

## Quickstart (Docker)

1. Copy the example config and adjust host values for your environment:

```bash
cp .env.example .env
```

2. Build and run:

```bash
docker compose up --build
```

3. Open the app:

```
http://localhost:5670
```

## Deploy with Stevedore

Roomtone ships a `docker-compose.yaml` that is ready for [Stevedore](https://github.com/jonnyzzz/stevedore).

```bash
stevedore repo add roomtone git@github.com:jonnyzzz/roomtone.git --branch main
stevedore repo key roomtone
```

Add the printed key to GitHub (read-only):

```bash
gh api -X POST repos/jonnyzzz/roomtone/keys \
  -f title="stevedore-roomtone" \
  -f key="$(stevedore repo key roomtone)" \
  -F read_only=true
```

Then deploy:

```bash
stevedore deploy sync roomtone
stevedore deploy up roomtone
stevedore status roomtone
```

Notes:
- For HTTPS-only traffic behind a reverse proxy, set `TRUST_PROXY=true` and keep `ALLOW_INSECURE_HTTP=false`.
- Stevedore injects `STEVEDORE_DATA`, `STEVEDORE_LOGS`, and `STEVEDORE_SHARED` for volumes. Local `docker compose` uses `.stevedore/` fallbacks.

## Stevedore DynDNS Integration

If you run [stevedore-dyndns](https://github.com/jonnyzzz/stevedore-dyndns), register
Roomtone as a subdomain and point the bot to the external URL:

```bash
/opt/stevedore/deployments/dyndns/scripts/register-service.sh roomtone localhost:5670 --websocket
```

Then set:

```
BOT_PUBLIC_BASE_URL=https://roomtone.your-domain.example
```

Roomtone also supports deriving the URL from `ROOMTONE_SUBDOMAIN` and
`DYNDNS_DOMAIN` (or `DYNDNS_DOMAIN_FILE`).

## Local Development

Install dependencies:

```bash
npm install
```

Start the server and the web app (two processes managed together):

```bash
npm run dev
```

Open the app at:

```
http://localhost:5173
```

## Configuration

These environment variables control runtime behavior:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port for the app server | `5670` |
| `ALLOW_INSECURE_HTTP` | Allow HTTP for localhost-only dev | `false` |
| `TRUST_PROXY` | Trust `X-Forwarded-*` headers from a reverse proxy | `false` |
| `MAX_PARTICIPANTS` | Maximum participants in the room | `10` |
| `WS_MAX_PAYLOAD` | Max WebSocket message size in bytes | `1048576` |
| `AUTH_ENABLED` | Require signed auth tokens for all requests | `false` |
| `AUTH_PUBLIC_KEYS` | PEM public keys (supports multiple) | empty |
| `AUTH_PUBLIC_KEYS_FILE` | Path to PEM public keys | empty |
| `AUTH_COOKIE_NAME` | Cookie name for auth token | `roomtone_auth` |
| `AUTH_CLOCK_SKEW_SECONDS` | Allowed clock skew for `exp` | `30` |
| `AUTH_HEALTH_TOKEN` | JWT used by Docker healthcheck | empty |
| `PUBLIC_BASE_URL` | Base URL for invite links (used by bot) | empty |

## Authentication (JWT)

Roomtone can require signed JWT tokens for every HTTP request and WebSocket
handshake. Use a presigned URL like:

```
https://your-host.example/?token=JWT_HERE
```

When a token arrives via query or header, the server sets a cookie so static
assets load normally. See `docs/AUTH.md` for the full specification and token
generation steps.

## Telegram Connection Bot (Optional)

Roomtone ships an optional Telegram bot that generates short-lived invite links.
It uses an allowlist of Telegram user IDs and signs JWTs with a private RSA key.

Configuration:

| Variable | Purpose | Default |
| --- | --- | --- |
| `BOT_ENABLED` | Enable the bot process | `false` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | empty |
| `TELEGRAM_ALLOWED_USERS` | Allowed Telegram user IDs (CSV/space) | empty |
| `TELEGRAM_ALLOWED_CHATS` | Optional allowed chat IDs (CSV/space) | empty |
| `TELEGRAM_ADMIN_USERS` | Admin Telegram user IDs (CSV/space) | empty |
| `TELEGRAM_ADMIN_USERNAMES` | Admin usernames (CSV/space) | empty |
| `TELEGRAM_BOT_USERNAME` | Bot username for mention detection | empty |
| `BOT_COMMAND` | Command trigger (DM or group) | `/invite` |
| `BOT_PUBLIC_BASE_URL` | Base URL for invite links | empty |
| `BOT_JWT_PRIVATE_KEY` | RSA private key PEM for signing | empty |
| `BOT_JWT_PRIVATE_KEY_FILE` | RSA private key file path | empty |
| `BOT_JWT_TTL_SECONDS` | Invite lifetime in seconds | `300` |
| `BOT_JWT_ISSUER` | JWT issuer claim | `roomtone-telegram` |
| `TELEGRAM_API_BASE_URL` | Telegram API base (tests) | `https://api.telegram.org` |
| `BOT_STATE_FILE` | Persistent allowlist file | `/var/lib/roomtone/bot-access.json` |

Run it with Docker Compose:

```bash
docker compose --profile bot up --build
```

Admins can manage allowlists with `/allow_user`, `/deny_user`, `/allow_chat`,
`/deny_chat`, and `/list_access` (see `docs/TELEGRAM_BOT.md`).

## HTTPS-Only Transport

Roomtone requires HTTPS for non-localhost traffic. Run it behind an HTTPS proxy or load balancer and set `TRUST_PROXY=true` so `X-Forwarded-Proto` can be trusted. Direct HTTP requests are rejected.

## No STUN/TURN

This build uses host ICE candidates only. That keeps signaling on HTTPS/WSS but may reduce connectivity on strict NATs. If you need global NAT traversal later, reintroduce TURN support.

## Architecture

See `ARCHITECTURE.md` for message flows and component details.

## Testing

Run unit + integration tests:

```bash
npm run test
```

Run Playwright integration tests (builds first):

```bash
npx playwright install
npm run test:e2e
```

## License

Apache-2.0. See `LICENSE`.
