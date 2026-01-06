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
- ICE servers are configurable via `ICE_SERVERS` (optional); `ICE_TRANSPORT_POLICY=relay` forces TURN relay when configured.
- Optional Telegram bot issues short-lived invite links (see `docs/TELEGRAM_BOT.md`).

## Deployment Notes

- HTTP listens on `PORT` (default 5670).
- HTTPS is required for non-localhost traffic; terminate TLS in front of the service and set `TRUST_PROXY=true`.
- `MAX_PARTICIPANTS` caps the room size (default 10).
- `WS_MAX_PAYLOAD` limits WebSocket message size in bytes.
- `ICE_SERVERS` provides STUN/TURN configuration (JSON or comma/space-separated URLs).
- `ICE_TRANSPORT_POLICY` can be `all` or `relay` (default `all`); use `relay` when media must traverse the backend relay.
- When `AUTH_ENABLED=true`, every HTTP request and WebSocket handshake requires a signed JWT token (`docs/AUTH.md`).
- The Telegram bot requires `BOT_ENABLED=true`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS`, and `PUBLIC_BASE_URL`.
- Admin commands are available when `TELEGRAM_ADMIN_USERS` or `TELEGRAM_ADMIN_USERNAMES` is set (see `docs/TELEGRAM_BOT.md`).
- Stevedore deployments mount `STEVEDORE_DATA`, `STEVEDORE_LOGS`, and `STEVEDORE_SHARED` volumes.
- Stevedore DynDNS discovery uses the Stevedore query socket (`STEVEDORE_SOCKET`, `STEVEDORE_TOKEN`) and falls back to `${STEVEDORE_SHARED}/dyndns-mappings.yaml`.
- DynDNS/Caddy logs live under `${STEVEDORE_LOGS}`; Roomtone client logs POST to `/logs` and are emitted as structured JSON in server stdout.

## Traffic Flow

- External traffic path: Cloudflare proxy (or direct DNS) → FritzBox port forward → stevedore-dyndns (Caddy) → Roomtone container.
- Caddy access logs: `/var/log/dyndns/caddy.log` inside the `stevedore-dyndns-dyndns-1` container.
- All client access must use HTTPS/WSS; WebSocket upgrades must be forwarded end-to-end.

## Deployment

- Production host: `ssh jonnyzzz@rp16g`
- Deploy via Stevedore: `stevedore deploy sync roomtone && stevedore deploy up roomtone`
- Bot deployment (when enabled): `stevedore deploy sync roomtone && stevedore deploy up roomtone --profile bot`
- Runtime data/logs persisted in `${STEVEDORE_DATA}` and `${STEVEDORE_LOGS}`.

## Debugging

- **Traffic path**: Cloudflare proxy (or direct DNS) → FritzBox port forward → `stevedore-dyndns` (Caddy) → Roomtone container.
- **Roomtone container logs**: `docker logs stevedore-roomtone-app-1` (look for `[rtc] ICE servers configured`, `source":"room"`, and `[ws]` warnings).
- **Client logs**: clients POST to `/logs`; server emits structured JSON (search for `"source":"client_log"`).
- **Caddy access logs**: inside dyndns container at `/var/log/dyndns/caddy.log` (use `docker exec stevedore-dyndns-dyndns-1 sh -c "tail -n 200 /var/log/dyndns/caddy.log"`).
- **WebSocket checks**: `/ws` returning `426` means upgrade headers are not forwarded; verify `stevedore.ingress.websocket=true` and Cloudflare WebSockets enabled.
- **HTTPS/WSS only**: non-localhost HTTP is rejected; ensure `TRUST_PROXY=true` so `X-Forwarded-Proto` is honored.
- **ICE/TURN**: if external peers stall at “connecting”, configure `ICE_SERVERS` and consider `ICE_TRANSPORT_POLICY=relay` for backend-only relay paths.
- **Log hygiene**: redact query params (`token`, `name`) before sharing logs; avoid committing hostnames or secrets.

## Implementation Conventions

- Keep server messages small JSON payloads.
- Prefer deterministic cleanup on disconnect (close peer connections, stop tracks).
- UI should remain mobile friendly and avoid complex flows.
- Versioning: update `VERSION` and `CHANGES.md` when shipping notable changes.
