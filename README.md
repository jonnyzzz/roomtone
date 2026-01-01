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

## HTTPS-Only Transport

Roomtone requires HTTPS for non-localhost traffic. Run it behind an HTTPS proxy or load balancer and set `TRUST_PROXY=true` so `X-Forwarded-Proto` can be trusted. Direct HTTP requests are rejected.

## No STUN/TURN

This build uses host ICE candidates only. That keeps signaling on HTTPS/WSS but may reduce connectivity on strict NATs. If you need global NAT traversal later, reintroduce TURN support.

## Architecture

See `ARCHITECTURE.md` for message flows and component details.

## Testing

Run unit tests:

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
