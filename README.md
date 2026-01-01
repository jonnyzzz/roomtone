# Roomtone

Roomtone is a single-room audio and video calling app built on WebRTC and WebSocket signaling. It runs behind plain HTTP (HTTPS handled externally), works on mobile and desktop, and ships with a TURN server for NAT traversal.

## Highlights

- One shared room for all participants.
- WebRTC audio and video with WebSocket signaling.
- Clean, mobile-friendly UI in React + TypeScript.
- Docker-first deployment with an embedded TURN server.
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
| `PUBLIC_HOST` | Public hostname when behind a reverse proxy | empty |
| `TURN_HOST` | Hostname for TURN relay (defaults to `PUBLIC_HOST`) | empty |
| `TURN_USERNAME` | TURN auth username | `telephony` |
| `TURN_PASSWORD` | TURN auth password | `telephony` |
| `TURN_PORT` | TURN UDP/TCP port | `3478` |
| `TURN_TLS_PORT` | TURN TLS port | `5349` |
| `ICE_SERVERS_JSON` | Override ICE server list as JSON | empty |

If `ICE_SERVERS_JSON` is set, it overrides TURN config entirely.

## TURN / NAT Traversal

The included `coturn` container listens on:

- `3478/tcp` and `3478/udp` for TURN.
- `5349/tcp` for TURN over TLS.
- `49160-49200/udp` for relayed media.

Make sure these ports are open on your firewall when hosting on the public internet. If your TURN server sits behind NAT, add the `--external-ip` flag to the `coturn` command in `docker-compose.yml`.

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
