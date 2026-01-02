import express from "express";
import http from "http";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { RoomState, Participant } from "./room";
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
const app = express();
app.set("trust proxy", trustProxy);
const authConfig = loadAuthConfig(process.env);

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

app.use((req, res, next) => {
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

  const lookup = getTokenFromRequest(
    req.url,
    req.headers,
    authConfig.cookieName
  );
  if (!lookup.token) {
    res.status(401).send("Missing auth token.");
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
    if (lookup.source === "cookie") {
      const secureCookie = isSecureRequest(
        req.headers,
        (req.socket as { encrypted?: boolean }).encrypted,
        trustProxy
      );
      res.setHeader(
        "Set-Cookie",
        buildClearCookie(authConfig.cookieName, secureCookie)
      );
    }
    res.status(401).send("Invalid auth token.");
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
const room = new RoomState();
const clientsById = new Map<string, WebSocket>();
const clientsBySocket = new Map<WebSocket, Participant>();

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
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

function handleLeave(ws: WebSocket) {
  const participant = clientsBySocket.get(ws);
  if (!participant) {
    return;
  }
  clientsBySocket.delete(ws);
  clientsById.delete(participant.id);
  room.remove(participant.id);
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

  ws.on("message", (raw) => {
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

      const participants = room
        .list()
        .filter((peer) => peer.id !== id);

      send(ws, { type: "welcome", id, participants });
      broadcast({ type: "peer-joined", peer: participant }, id);
      return;
    }

    if (message?.type === "signal") {
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

  ws.on("close", () => handleLeave(ws));
  ws.on("error", () => handleLeave(ws));
});

server.listen(port, () => {
  console.log(`Roomtone server listening on :${port}`);
});
