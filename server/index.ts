import express from "express";
import http from "http";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { RoomState, Participant } from "./room";
import { parseIceServers, parseIceTransportPolicy } from "./ice";
import { buildMediaPacket } from "./media";
import {
  buildAuthCookie,
  buildClearCookie,
  getTokenFromRequest,
  loadAuthConfig,
  verifyJwt
} from "./auth";

const port = Number(process.env.PORT ?? "5670");
const allowInsecure = process.env.ALLOW_INSECURE_HTTP === "true";
const trustProxy = process.env.TRUST_PROXY === "true";
const maxParticipantsRaw = Number(process.env.MAX_PARTICIPANTS ?? "10");
const maxParticipants =
  Number.isFinite(maxParticipantsRaw) && maxParticipantsRaw > 0
    ? maxParticipantsRaw
    : 10;
const maxPayloadRaw = Number(process.env.WS_MAX_PAYLOAD ?? "1048576");
const maxPayloadBytes =
  Number.isFinite(maxPayloadRaw) && maxPayloadRaw > 0
    ? maxPayloadRaw
    : 1048576;
const mediaTransportRaw = (process.env.MEDIA_TRANSPORT ?? "ws").trim();
const mediaTransport =
  mediaTransportRaw.toLowerCase() === "webrtc" ? "webrtc" : "ws";
if (
  mediaTransportRaw &&
  mediaTransportRaw.toLowerCase() !== "webrtc" &&
  mediaTransportRaw.toLowerCase() !== "ws"
) {
  console.warn(
    `[config] Unknown MEDIA_TRANSPORT="${mediaTransportRaw}", defaulting to "${mediaTransport}".`
  );
}
const iceServers = parseIceServers(process.env.ICE_SERVERS);
const iceTransportPolicy = parseIceTransportPolicy(
  process.env.ICE_TRANSPORT_POLICY
);
const clientLogBodyLimit = "32kb";
const app = express();
app.set("trust proxy", trustProxy);
const authConfig = loadAuthConfig(process.env);
const room = new RoomState();
const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "connect-src 'self' https: wss: http: ws:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "script-src 'self'"
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "0"
} as const;

if (authConfig.enabled && authConfig.publicKeys.length === 0) {
  throw new Error("AUTH_ENABLED is true but no AUTH_PUBLIC_KEYS were provided.");
}

function isLoopbackAddress(address?: string): boolean {
  if (!address) {
    return false;
  }
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function isSecureRequest(
  headers: IncomingHttpHeaders,
  encrypted: boolean | undefined,
  allowForwarded: boolean
): boolean {
  if (encrypted) {
    return true;
  }

  if (!allowForwarded) {
    return false;
  }

  const protoHeader = headers["x-forwarded-proto"];
  const raw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  if (!raw) {
    return false;
  }

  return raw.split(",")[0]?.trim() === "https";
}

function isHealthRequest(req: express.Request): boolean {
  return req.path === "/health";
}

function sanitizeUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return "";
  }
  try {
    const parsed = new URL(rawUrl, "http://localhost");
    if (parsed.searchParams.has("token")) {
      parsed.searchParams.set("token", "redacted");
    }
    if (parsed.searchParams.has("name")) {
      parsed.searchParams.set("name", "redacted");
    }
    return parsed.pathname + parsed.search;
  } catch {
    return rawUrl
      .replace(/token=[^&]+/g, "token=redacted")
      .replace(/name=[^&]+/g, "name=redacted");
  }
}

type ClientLogPayload = {
  level?: string;
  event?: string;
  message?: string;
  details?: unknown;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
  joined?: boolean;
};

function normalizeLogLevel(value: unknown): string {
  if (typeof value !== "string") {
    return "info";
  }
  const normalized = value.toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return value.slice(0, limit);
}

function normalizeLogText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return truncate(trimmed, limit);
}

function normalizeLogDetails(value: unknown): string | undefined {
  if (value === null || typeof value === "undefined") {
    return undefined;
  }
  if (typeof value === "string") {
    return truncate(value, 2000);
  }
  try {
    return truncate(JSON.stringify(value), 2000);
  } catch {
    return undefined;
  }
}

function respondAuthRequired(
  req: express.Request,
  res: express.Response,
  status: number,
  reason: string
): void {
  const wantsHtml = Boolean(req.accepts("html"));
  if (!wantsHtml) {
    res.status(status).send(reason);
    return;
  }
  res.status(status).type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Roomtone - Authentication Required</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; background: #f6f6f6; }
      .card { max-width: 560px; margin: 10vh auto; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 4px 18px rgba(0,0,0,0.08); }
      h1 { font-size: 20px; margin: 0 0 12px; }
      p { margin: 8px 0; line-height: 1.4; }
      code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authentication required</h1>
      <p>This Roomtone instance requires a signed invite link.</p>
      <p>Please open the link you received from the bot, or use a URL with a <code>?token=...</code> parameter.</p>
      <p>If you believe this is an error, request a fresh invite.</p>
    </div>
  </body>
</html>`);
}

function logMissingWsUpgrade(req: express.Request): void {
  const cleanUrl = sanitizeUrl(req.url);
  const connectionHeader = req.headers.connection;
  const upgradeHeader = req.headers.upgrade;
  const protoHeader = req.headers["x-forwarded-proto"];
  const connection = Array.isArray(connectionHeader)
    ? connectionHeader.join(",")
    : connectionHeader ?? "";
  const upgrade = Array.isArray(upgradeHeader)
    ? upgradeHeader.join(",")
    : upgradeHeader ?? "";
  const forwardedProto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader ?? "";
  console.warn(
    `[ws] Upgrade missing for ${cleanUrl} connection="${connection}" upgrade="${upgrade}" x-forwarded-proto="${forwardedProto}"`
  );
}

app.use((req, res, next) => {
  const start = Date.now();
  const cleanUrl = sanitizeUrl(req.url);
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[http] ${req.method} ${cleanUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

app.use((req, res, next) => {
  for (const [header, value] of Object.entries(securityHeaders)) {
    res.setHeader(header, value);
  }
  if (
    isSecureRequest(
      req.headers,
      (req.socket as { encrypted?: boolean }).encrypted,
      trustProxy
    )
  ) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
});

app.use((req, res, next) => {
  if (isHealthRequest(req)) {
    next();
    return;
  }
  const isLoopback = isLoopbackAddress(req.socket.remoteAddress);
  if (
    allowInsecure ||
    isLoopback ||
    isSecureRequest(
      req.headers,
      (req.socket as { encrypted?: boolean }).encrypted,
      trustProxy
    )
  ) {
    next();
    return;
  }
  res.status(400).send("HTTPS is required.");
});

app.use((req, res, next) => {
  if (!authConfig.enabled) {
    next();
    return;
  }

  if (isHealthRequest(req)) {
    next();
    return;
  }

  const lookup = getTokenFromRequest(
    req.url,
    req.headers,
    authConfig.cookieName
  );
  if (!lookup.token) {
    respondAuthRequired(req, res, 401, "Missing auth token.");
    return;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const result = verifyJwt(
    lookup.token,
    authConfig.publicKeys,
    nowSeconds,
    authConfig.clockSkewSeconds
  );
  if (!result.ok || !result.claims) {
    const secureCookie = isSecureRequest(
      req.headers,
      (req.socket as { encrypted?: boolean }).encrypted,
      trustProxy
    );
    res.setHeader(
      "Set-Cookie",
      buildClearCookie(authConfig.cookieName, secureCookie)
    );
    respondAuthRequired(req, res, 401, "Invalid auth token.");
    return;
  }

  if (lookup.source !== "cookie") {
    const expiresIn = Math.max(0, result.claims.exp - nowSeconds);
    const secureCookie = isSecureRequest(
      req.headers,
      (req.socket as { encrypted?: boolean }).encrypted,
      trustProxy
    );
    res.setHeader(
      "Set-Cookie",
      buildAuthCookie(
        authConfig.cookieName,
        lookup.token,
        expiresIn,
        secureCookie
      )
    );
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/participants", (_req, res) => {
  res.json(room.list());
});

app.post(
  "/logs",
  express.text({ type: "*/*", limit: clientLogBodyLimit }),
  (req, res) => {
    let payload: ClientLogPayload | null = null;
    if (typeof req.body === "string" && req.body.trim().length > 0) {
      try {
        payload = JSON.parse(req.body) as ClientLogPayload;
      } catch {
        res.status(400).send("Invalid log payload.");
        return;
      }
    } else if (req.body && typeof req.body === "object") {
      payload = req.body as ClientLogPayload;
    }

    if (!payload || typeof payload !== "object") {
      res.status(400).send("Invalid log payload.");
      return;
    }

    const event = normalizeLogText(payload.event, 80);
    if (!event) {
      res.status(400).send("Log event is required.");
      return;
    }

    const entry = {
      source: "client",
      level: normalizeLogLevel(payload.level),
      event,
      message: normalizeLogText(payload.message, 500),
      details: normalizeLogDetails(payload.details),
      sessionId: normalizeLogText(payload.sessionId, 120),
      url: normalizeLogText(sanitizeUrl(payload.url), 200),
      userAgent: normalizeLogText(payload.userAgent, 200),
      timestamp: normalizeLogText(payload.timestamp, 40),
      joined: typeof payload.joined === "boolean" ? payload.joined : undefined,
      receivedAt: new Date().toISOString()
    };

    console.log(JSON.stringify(entry));
    res.status(204).send();
  }
);

app.get("/ws", (req, res) => {
  logMissingWsUpgrade(req);
  res
    .status(426)
    .type("text/plain")
    .send(
      "WebSocket upgrade required. Ensure your proxy forwards Upgrade and Connection headers."
    );
});

const clientDist = path.resolve(__dirname, "..", "client");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .status(503)
      .send("Client build missing. Run npm run build to generate assets.");
  });
}

const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: maxPayloadBytes
});
const clientsById = new Map<string, WebSocket>();
const clientsBySocket = new Map<WebSocket, Participant>();
const mediaById = new Map<string, string>();
const entropyTimers = new Map<WebSocket, NodeJS.Timeout>();
const entropyMinBytes = 128;
const entropyMaxBytes = 1024;
const entropyMinDelayMs = 1500;
const entropyMaxDelayMs = 3500;

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendBinary(ws: WebSocket, payload: Buffer) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(payload);
  }
}

function randomIntInclusive(min: number, max: number): number {
  return crypto.randomInt(min, max + 1);
}

function scheduleEntropy(ws: WebSocket): void {
  const delay = randomIntInclusive(entropyMinDelayMs, entropyMaxDelayMs);
  const timer = setTimeout(() => {
    entropyTimers.delete(ws);
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const size = randomIntInclusive(entropyMinBytes, entropyMaxBytes);
    send(ws, {
      type: "entropy",
      bytes: size,
      data: crypto.randomBytes(size).toString("base64")
    });
    scheduleEntropy(ws);
  }, delay);
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  entropyTimers.set(ws, timer);
}

function stopEntropy(ws: WebSocket): void {
  const timer = entropyTimers.get(ws);
  if (!timer) {
    return;
  }
  clearTimeout(timer);
  entropyTimers.delete(ws);
}

function normalizeMediaMimeType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 120) {
    return null;
  }
  if (!/^[a-z0-9]+\/[a-z0-9.+-]+/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function toBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw as Buffer[]);
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw);
  }
  return Buffer.from(raw as any);
}

function broadcastMedia(senderId: string, payload: Buffer): void {
  const packet = buildMediaPacket(senderId, payload);
  if (packet.length > maxPayloadBytes) {
    console.warn(
      `[media] Dropping packet from ${senderId}: ${packet.length} bytes exceeds WS_MAX_PAYLOAD.`
    );
    return;
  }
  for (const [id, socket] of clientsById.entries()) {
    if (id === senderId) {
      continue;
    }
    sendBinary(socket, packet);
  }
}

function broadcast(payload: unknown, exceptId?: string) {
  for (const [id, socket] of clientsById.entries()) {
    if (id === exceptId) {
      continue;
    }
    send(socket, payload);
  }
}

function logRoomEvent(event: string, details: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      source: "room",
      event,
      participants: room.count(),
      at: new Date().toISOString(),
      ...details
    })
  );
}

function listMediaPeers(exceptId?: string): { id: string; mimeType: string }[] {
  const peers: { id: string; mimeType: string }[] = [];
  for (const [peerId, mimeType] of mediaById.entries()) {
    if (peerId === exceptId) {
      continue;
    }
    peers.push({ id: peerId, mimeType });
  }
  return peers;
}

function handleLeave(ws: WebSocket) {
  const participant = clientsBySocket.get(ws);
  if (!participant) {
    return;
  }
  clientsBySocket.delete(ws);
  clientsById.delete(participant.id);
  room.remove(participant.id);
  if (mediaById.delete(participant.id)) {
    broadcast({ type: "media-stop", peerId: participant.id });
  }
  logRoomEvent("left", { id: participant.id });
  broadcast({ type: "peer-left", peerId: participant.id });
}

wss.on("connection", (ws, req) => {
  const isLoopback = isLoopbackAddress(req.socket.remoteAddress);
  if (
    !allowInsecure &&
    !isLoopback &&
    !isSecureRequest(
      req.headers,
      (req.socket as { encrypted?: boolean }).encrypted,
      trustProxy
    )
  ) {
    ws.close(1008, "HTTPS is required.");
    return;
  }

  if (authConfig.enabled) {
    const lookup = getTokenFromRequest(
      req.url,
      req.headers,
      authConfig.cookieName
    );
    if (!lookup.token) {
      ws.close(1008, "Missing auth token.");
      return;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result = verifyJwt(
      lookup.token,
      authConfig.publicKeys,
      nowSeconds,
      authConfig.clockSkewSeconds
    );
    if (!result.ok) {
      ws.close(1008, "Invalid auth token.");
      return;
    }
  }

  logRoomEvent("ws_connected", {});
  scheduleEntropy(ws);

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      if (mediaTransport !== "ws") {
        return;
      }
      const sender = clientsBySocket.get(ws);
      if (!sender) {
        return;
      }
      if (!mediaById.has(sender.id)) {
        return;
      }
      const payload = toBuffer(raw);
      if (payload.length === 0) {
        return;
      }
      broadcastMedia(sender.id, payload);
      return;
    }

    let message: any;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON." });
      return;
    }

    if (message?.type === "join") {
      if (clientsBySocket.has(ws)) {
        return;
      }
      const rawName = String(message.name ?? "").trim();
      const name = rawName.slice(0, 40);
      if (!name) {
        send(ws, { type: "error", message: "Name is required." });
        return;
      }

      if (room.count() >= maxParticipants) {
        send(ws, { type: "error", message: "Room is full." });
        ws.close(1008, "Room is full.");
        return;
      }

      const id = crypto.randomUUID();
      const participant = room.add(id, name);
      clientsById.set(id, ws);
      clientsBySocket.set(ws, participant);
      logRoomEvent("joined", { id });

      const participants = room
        .list()
        .filter((peer) => peer.id !== id);

      send(ws, {
        type: "welcome",
        id,
        participants,
        iceServers,
        iceTransportPolicy,
        mediaTransport,
        mediaPeers: listMediaPeers(id)
      });
      broadcast({ type: "peer-joined", peer: participant }, id);
      return;
    }

    if (message?.type === "media-start") {
      if (mediaTransport !== "ws") {
        send(ws, { type: "error", message: "Media transport is disabled." });
        return;
      }
      const sender = clientsBySocket.get(ws);
      if (!sender) {
        send(ws, { type: "error", message: "Join first." });
        return;
      }
      const mimeType = normalizeMediaMimeType(message.mimeType);
      if (!mimeType) {
        send(ws, { type: "error", message: "Invalid media MIME type." });
        return;
      }
      mediaById.set(sender.id, mimeType);
      logRoomEvent("media_start", { id: sender.id, mimeType });
      broadcast({ type: "media-start", peerId: sender.id, mimeType }, sender.id);
      return;
    }

    if (message?.type === "media-stop") {
      const sender = clientsBySocket.get(ws);
      if (!sender) {
        send(ws, { type: "error", message: "Join first." });
        return;
      }
      if (mediaById.delete(sender.id)) {
        logRoomEvent("media_stop", { id: sender.id });
        broadcast({ type: "media-stop", peerId: sender.id }, sender.id);
      }
      return;
    }

    if (message?.type === "signal") {
      if (mediaTransport !== "webrtc") {
        return;
      }
      const sender = clientsBySocket.get(ws);
      if (!sender) {
        send(ws, { type: "error", message: "Join first." });
        return;
      }

      const targetId = String(message.to ?? "");
      const data = message.data ?? {};
      const target = clientsById.get(targetId);
      if (!target) {
        send(ws, { type: "error", message: "Peer is no longer available." });
        return;
      }

      send(target, {
        type: "signal",
        from: sender.id,
        data
      });
    }
  });

  const cleanupSocket = () => {
    const joined = clientsBySocket.has(ws);
    stopEntropy(ws);
    if (!joined) {
      logRoomEvent("ws_disconnected", { joined: false });
    }
    handleLeave(ws);
  };
  ws.on("close", cleanupSocket);
  ws.on("error", cleanupSocket);
});

server.listen(port, () => {
  console.log(
    `[media] transport=${mediaTransport} iceServers=${iceServers.length} policy=${iceTransportPolicy}`
  );
  console.log(`Roomtone server listening on :${port}`);
});
