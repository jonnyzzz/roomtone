# AGENTS.md

This repo is a single-room WebRTC calling app with a Node signaling server and a React UI. Use this file as the primary reference for automation and future maintenance.

## Key Commands

- Install deps: `npm install`
- Dev (server + web): `npm run dev`
- Dev (bot only): `npm run dev:bot`
- Build: `npm run build`
- Start production server: `npm run start`
- Start bot: `npm run start:bot`
- Unit tests: `npm run test`
- E2E tests (Playwright): `npm run test:e2e`
- Auth pentest (OWASP ZAP): `./scripts/pentest-auth.sh`
- Docker: `docker compose up --build`

## Layout

- `server/` Node signaling server and room state.
- `src/` React client and WebRTC flow.
- `tests/unit/` Vitest unit tests.
- `tests/e2e/` Playwright integration tests.
- `docker-compose.yaml` runs the app container and is Stevedore-ready.

## Runtime Behavior

- One shared room for all participants.
- WebSocket signaling at `/ws`.
- Client uses host ICE candidates only (no STUN/TURN).
- Optional Telegram bot issues short-lived invite links (see `docs/TELEGRAM_BOT.md`).

## Deployment Notes

- HTTP listens on `PORT` (default 5670).
- HTTPS is required for non-localhost traffic; terminate TLS in front of the service and set `TRUST_PROXY=true`.
- `MAX_PARTICIPANTS` caps the room size (default 10).
- `WS_MAX_PAYLOAD` limits WebSocket message size in bytes.
- When `AUTH_ENABLED=true`, every HTTP request and WebSocket handshake requires a signed JWT token (`docs/AUTH.md`).
- The Telegram bot requires `BOT_ENABLED=true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, and `PUBLIC_BASE_URL`.
- Admin commands are available when `TELEGRAM_ADMIN_USERS` or `TELEGRAM_ADMIN_USERNAMES` is set (see `docs/TELEGRAM_BOT.md`).
- Stevedore deployments mount `STEVEDORE_DATA`, `STEVEDORE_LOGS`, and `STEVEDORE_SHARED` volumes.

## Implementation Conventions

- Keep server messages small JSON payloads.
- Prefer deterministic cleanup on disconnect (close peer connections, stop tracks).
- UI should remain mobile friendly and avoid complex flows.
- Versioning: update `VERSION` and `CHANGES.md` when shipping notable changes.
