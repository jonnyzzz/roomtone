# AGENTS.md

This repo is a single-room WebRTC calling app with a Node signaling server and a React UI. Use this file as the primary reference for automation and future maintenance.

## Key Commands

- Install deps: `npm install`
- Dev (server + web): `npm run dev`
- Build: `npm run build`
- Start production server: `npm run start`
- Unit tests: `npm run test`
- E2E tests (Playwright): `npm run test:e2e`
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

## Deployment Notes

- HTTP listens on `PORT` (default 5670).
- HTTPS is required for non-localhost traffic; terminate TLS in front of the service and set `TRUST_PROXY=true`.
- `MAX_PARTICIPANTS` caps the room size (default 10).
- `WS_MAX_PAYLOAD` limits WebSocket message size in bytes.
- Stevedore deployments mount `STEVEDORE_DATA`, `STEVEDORE_LOGS`, and `STEVEDORE_SHARED` volumes.

## Implementation Conventions

- Keep server messages small JSON payloads.
- Prefer deterministic cleanup on disconnect (close peer connections, stop tracks).
- UI should remain mobile friendly and avoid complex flows.
