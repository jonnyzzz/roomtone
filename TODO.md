# TODO

## Issues

### [x] Investigate rp16g container logs for connection failures
**Priority**: High
**Reported**: 2026-01-06

Review all Docker container logs on rp16g around the incident window and
correlate with client connection attempts.

---

### [ ] Fix external WebRTC connectivity (ICE servers)
**Priority**: High
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/roomtone/issues/2

Outside clients stay in “connecting” state. Investigate ICE candidate
configuration and add STUN/TURN support so remote peers can connect.

**Suggested fixes:**
1. Add ICE server configuration (env-driven) to the signaling flow.
2. Update docs/tests and deploy.

**Notes:** Production env currently has `ICE_SERVERS` empty and defaults to
host-only candidates; configure TURN (prefer `turns:`) and set
`ICE_TRANSPORT_POLICY=relay` via Stevedore params before re-testing.

---

### [ ] Clarify backend-only media requirement and relay policy
**Priority**: High
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/roomtone/issues/3

Requirement states all call traffic must be backend-only and wrapped in
HTTPS/WSS. Confirm whether TURN/TLS relay is acceptable, or whether a media
relay/SFU is required, and document the supported transport policy.

**Constraint:** No TURN server is available; evaluate SFU or custom media-over-WSS
approach if backend-only traffic is mandatory.

---

### [x] Add WebSocket entropy keepalive messages
**Priority**: Medium
**Reported**: 2026-01-06

Send randomized payloads over `/ws` in both directions to keep connections
active without exceeding 100kb/s per direction.

---

### [x] Ensure CI build stays green (run tests locally)
**Priority**: High
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/roomtone/issues/4

Make sure GitHub Actions build is green by running the full local test suite
before pushing changes.

**Suggested fixes:**
1. Run `npm run test` and `npm run test:e2e`.
2. Fix `pentest:auth` ZAP permissions/auth handling to avoid CI failures.

**Status:** CI run 20759783461 green after cookie-based pentest updates.

---

### [ ] Improve runtime error handling coverage
**Priority**: Medium
**Reported**: 2026-01-06

Double-check that unexpected errors during script/runtime execution are captured,
logged, and do not leave services in partial states.

**Suggested fixes:**
1. Audit startup scripts for unhandled failures and add guard rails.
2. Expand logging and exit handling for unexpected exceptions.

---

### [x] Expand UI layout coverage across devices/orientations
**Priority**: Medium
**Reported**: 2026-01-06

Add Playwright (or equivalent) coverage for desktop + phone viewports in
portrait and landscape orientation to validate the UI layout.

**Suggested fixes:**
1. Add Playwright tests for phone portrait/landscape and desktop breakpoints.
2. Include checks for call chrome visibility and video grid sizing.

---

### [ ] Review auth/localhost checks for real security impact
**Priority**: High
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/roomtone/issues/1

The client-side `isLocalhost` checks gate HTTPS requirements but do not provide
real security. We should review the overall authentication and transport
requirements to ensure the service is secure without relying on easily bypassed
client logic.

**Suggested fixes:**
1. Re-evaluate when HTTPS is required on the server side.
2. Remove client-side localhost exemptions if unnecessary.
3. Add tests to confirm secure behavior for external requests.

---

### [x] Remember username via local storage (override invite names)
**Priority**: Medium
**Reported**: 2026-01-06

Persist the entered display name locally and prefill it on next visit. Stored
names should take precedence over any invite-provided names.

**Suggested fixes:**
1. Read/write the name from localStorage on the client.
2. Add a UI test to verify prefill behavior.

---

### [ ] stevedore-dyndns discovery poll does not refresh services
**Priority**: High
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/stevedore-dyndns/issues/4

The dyndns discovery client treats `/poll` responses as carrying updated service
lists, but the stevedore query socket only returns change events and a timestamp.
This means dyndns will not refresh ingress services when deployments change.

**Suggested fix:**
1. When `/poll` returns `changed=true` without services, fetch
   `/services?ingress=true` and regenerate the Caddy config.
2. Add test coverage for change events without services payloads.

---

### [ ] stevedore-dyndns uses localhost for upstreams, which can resolve to IPv6
**Priority**: Medium
**Reported**: 2026-01-06
**GitHub**: https://github.com/jonnyzzz/stevedore-dyndns/issues/5

Using `localhost` for reverse proxy targets can resolve to `::1`. If the
upstream only binds IPv4, health checks and proxy connections fail.

**Suggested fix:**
1. Use `127.0.0.1` (or configurable host) for proxy targets.
2. Add a test or config guard for IPv4-only services.

---

### [ ] DNS resolution failures causing Telegram API timeouts
**Priority**: Medium
**Reported**: 2026-01-06

The Roomtone Telegram bot experiences intermittent DNS resolution failures:
```
Telegram bot error: TypeError: fetch failed
  [cause]: Error: getaddrinfo EAI_AGAIN api.telegram.org
```

And connection timeouts:
```
[cause]: AggregateError [ETIMEDOUT]
```

These errors occur during periods of network instability (possibly related to router DNS).

**Suggested fixes:**
1. Add retry logic with exponential backoff for Telegram API calls
2. Consider using a more resilient DNS resolver (e.g., 8.8.8.8, 1.1.1.1)
3. Add connection timeout configuration
4. Implement graceful error handling to prevent crash loops
