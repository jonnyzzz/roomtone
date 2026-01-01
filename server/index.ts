import express from "express";
import http from "http";
import type { IncomingHttpHeaders } from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { WebSocketServer, WebSocket } from "ws";
import { RoomState, Participant } from "./room";

const port = Number(process.env.PORT ?? "5670");
const allowInsecure = process.env.ALLOW_INSECURE_HTTP === "true";
const app = express();
app.set("trust proxy", true);

function hostFromHeaders(headers: IncomingHttpHeaders): string | undefined {
  const value =
    (headers["x-forwarded-host"] as string | string[] | undefined) ??
    headers.host;
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }

  const first = raw.split(",")[0]?.trim();
  if (!first) {
    return undefined;
  }

  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    if (end > 1) {
      return first.slice(1, end);
    }
  }

  return first.split(":")[0];
}

function isLoopbackHost(host?: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isSecureRequest(
  headers: IncomingHttpHeaders,
  encrypted?: boolean
): boolean {
  if (encrypted) {
    return true;
  }

  const protoHeader = headers["x-forwarded-proto"];
  const raw = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  if (!raw) {
    return false;
  }

  return raw.split(",")[0]?.trim() === "https";
}

app.use((req, res, next) => {
  const host = hostFromHeaders(req.headers);
  if (
    allowInsecure ||
    isLoopbackHost(host) ||
    isSecureRequest(req.headers, (req.socket as { encrypted?: boolean }).encrypted)
  ) {
    next();
    return;
  }
  res.status(400).send("HTTPS is required.");
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
const wss = new WebSocketServer({ server, path: "/ws" });
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
  const host = hostFromHeaders(req.headers);
  if (
    !allowInsecure &&
    !isLoopbackHost(host) &&
    !isSecureRequest(req.headers, (req.socket as { encrypted?: boolean }).encrypted)
  ) {
    ws.close(1008, "HTTPS is required.");
    return;
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
