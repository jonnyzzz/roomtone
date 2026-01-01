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
- `docker-compose.yml` includes the app and a coturn relay.

## Runtime Behavior

- One shared room for all participants.
- WebSocket signaling at `/ws`.
- Client fetches ICE config from `/config`.
- TURN settings are read from environment variables and default to the included coturn container.

## Deployment Notes

- HTTP listens on `PORT` (default 5670).
- HTTPS is expected to terminate in front of this service.
- TURN uses UDP 3478 and the relay range 49160-49200.

## Implementation Conventions

- Keep server messages small JSON payloads.
- Prefer deterministic cleanup on disconnect (close peer connections, stop tracks).
- UI should remain mobile friendly and avoid complex flows.
