# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-01-06

### Added
- WebSocket media transport using MediaRecorder + MediaSource (backend-only default).
- Media packet framing and unit tests for WebSocket fan-out.
- `MEDIA_TRANSPORT` config to choose `ws` or `webrtc`.

### Changed
- Default transport is backend WebSocket media; WebRTC signaling is optional.
- Docs updated for WebSocket media and deployment/debugging notes.

## [0.2.5] - 2026-01-06

### Changed
- Auth pentest now uses cookie-based authentication (no tokens in URLs).

## [0.2.4] - 2026-01-06

### Added
- Security headers (CSP, frame/content-type protections) plus HSTS on secure requests.

### Changed
- Auth pentest script now fails fast on startup issues and relaxes CI warnings while preserving reports.

## [0.2.3] - 2026-01-06

### Added
- Configurable ICE server list and relay-only policy to improve external connectivity.
- WebSocket entropy keepalive messages in both directions.

### Changed
- Landscape phone layout keeps the local tile in the grid so only video is visible.
- Invite links and client URL cleanup strip `name` parameters.

## [0.2.2] - 2026-01-06

### Changed
- Client logs are posted to `/logs` and server emits structured room events.
- Client remembers the last display name via local storage.

## [0.2.1] - 2026-01-06

### Changed
- Telegram invite tokens no longer embed display names; users enter names when joining.
- Auth UI no longer pre-fills names from tokens.
- Phone landscape layout hides call chrome so only video tiles remain.

## [0.2.0] - 2026-01-02

### Added
- Version tracking via `VERSION` and this changelog.

### Changed
- Call layout now fills the screen with a dedicated stage.
- Local self-view is shown as a compact preview when others are present.
- Call controls are smaller and more streamlined.
- UI copy now supports Russian when the browser locale starts with `ru`.

## [0.1.0] - Initial development

- Single-room WebRTC calling with WebSocket signaling.
- HTTPS-only signaling, JWT auth support, and Telegram invite bot.
