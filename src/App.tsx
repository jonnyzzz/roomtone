import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Participant = {
  id: string;
  name: string;
};

type SignalPayload = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type NotificationState = NotificationPermission | "unsupported";

type ServerMessage =
  | { type: "welcome"; id: string; participants: Participant[] }
  | { type: "peer-joined"; peer: Participant }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload }
  | { type: "error"; message: string };

type Copy = {
  brandTagline: string;
  status: {
    connected: string;
    connecting: string;
    error: string;
    idle: string;
  };
  join: {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    button: string;
    joining: string;
    hint: string;
  };
  notifications: {
    title: string;
    blocked: string;
    prompt: string;
    action: string;
  };
  errors: {
    enterName: string;
    httpsRequired: string;
    badMessage: string;
    connectPeer: string;
    connectionClosed: string;
    signaling: string;
    startFailed: string;
    notifyHttps: string;
    notifyBlocked: string;
    notifyEnableFailed: string;
  };
  call: {
    roomTitle: string;
    participantsLabel: (count: number) => string;
  };
  controls: {
    mute: string;
    unmute: string;
    cameraOn: string;
    cameraOff: string;
    leave: string;
  };
  tiles: {
    connecting: string;
    you: string;
  };
  notificationTitle: string;
  notificationBody: (name: string) => string;
};

const EN_COPY: Copy = {
  brandTagline: "One room. Real voices.",
  status: {
    connected: "Live",
    connecting: "Dialing",
    error: "Offline",
    idle: "Idle"
  },
  join: {
    title: "Enter the room",
    subtitle:
      "Everyone meets in a single virtual room. Bring your mic and camera and you are in.",
    nameLabel: "Your name",
    namePlaceholder: "e.g. Tania",
    button: "Join room",
    joining: "Joining...",
    hint: "For best results, allow camera and microphone when prompted."
  },
  notifications: {
    title: "Stay in the loop.",
    blocked: "Notifications are blocked in your browser settings.",
    prompt: "Enable notifications to hear when someone joins the room.",
    action: "Enable notifications"
  },
  errors: {
    enterName: "Enter a name to join the room.",
    httpsRequired: "HTTPS is required to join the room.",
    badMessage: "Bad message from server.",
    connectPeer: "Unable to connect to a peer.",
    connectionClosed: "Connection closed.",
    signaling: "Signaling error.",
    startFailed:
      "Unable to start the call. Check camera permissions and server access.",
    notifyHttps: "Notifications require HTTPS.",
    notifyBlocked: "Notifications are blocked in your browser settings.",
    notifyEnableFailed: "Unable to enable notifications."
  },
  call: {
    roomTitle: "Global room",
    participantsLabel: (count) => (count === 1 ? "participant" : "participants")
  },
  controls: {
    mute: "Mute",
    unmute: "Unmute",
    cameraOn: "Camera on",
    cameraOff: "Camera off",
    leave: "Leave"
  },
  tiles: {
    connecting: "Connecting...",
    you: "You"
  },
  notificationTitle: "Roomtone",
  notificationBody: (name) => `${name} joined the room.`
};

const RU_COPY: Copy = {
  brandTagline: "\u041e\u0434\u043d\u0430 \u043a\u043e\u043c\u043d\u0430\u0442\u0430. \u0416\u0438\u0432\u044b\u0435 \u0433\u043e\u043b\u043e\u0441\u0430.",
  status: {
    connected: "\u0412 \u044d\u0444\u0438\u0440\u0435",
    connecting: "\u0421\u043e\u0435\u0434\u0438\u043d\u044f\u0435\u043c",
    error: "\u041e\u0444\u043b\u0430\u0439\u043d",
    idle: "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435"
  },
  join: {
    title: "\u0412\u043e\u0439\u0442\u0438 \u0432 \u043a\u043e\u043c\u043d\u0430\u0442\u0443",
    subtitle:
      "\u0412\u0441\u0435 \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u044e\u0442\u0441\u044f \u0432 \u043e\u0434\u043d\u043e\u0439 \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0439 \u043a\u043e\u043c\u043d\u0430\u0442\u0435. \u0412\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d \u0438 \u043a\u0430\u043c\u0435\u0440\u0443 \u2014 \u0438 \u0432\u044b \u0432 \u044d\u0444\u0438\u0440\u0435.",
    nameLabel: "\u0412\u0430\u0448\u0435 \u0438\u043c\u044f",
    namePlaceholder: "\u043d\u0430\u043f\u0440\u0438\u043c\u0435\u0440, \u0422\u0430\u043d\u044f",
    button: "\u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u0442\u044c\u0441\u044f",
    joining: "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c\u0441\u044f...",
    hint:
      "\u0414\u043b\u044f \u043b\u0443\u0447\u0448\u0435\u0433\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430 \u0440\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u043a\u0430\u043c\u0435\u0440\u0435 \u0438 \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d\u0443."
  },
  notifications: {
    title: "\u0411\u0443\u0434\u044c\u0442\u0435 \u0432 \u043a\u0443\u0440\u0441\u0435.",
    blocked:
      "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.",
    prompt:
      "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f, \u0447\u0442\u043e\u0431\u044b \u0437\u043d\u0430\u0442\u044c, \u043a\u043e\u0433\u0434\u0430 \u043a\u0442\u043e-\u0442\u043e \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u044f\u0435\u0442\u0441\u044f \u043a \u043a\u043e\u043c\u043d\u0430\u0442\u0435.",
    action: "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f"
  },
  errors: {
    enterName:
      "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f, \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u0442\u044c\u0441\u044f.",
    httpsRequired: "\u0414\u043b\u044f \u0432\u0445\u043e\u0434\u0430 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f HTTPS.",
    badMessage: "\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043e\u0442 \u0441\u0435\u0440\u0432\u0435\u0440\u0430.",
    connectPeer:
      "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0443.",
    connectionClosed: "\u0421\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435 \u0437\u0430\u043a\u0440\u044b\u0442\u043e.",
    signaling: "\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0438\u0433\u043d\u0430\u043b\u0438\u043d\u0433\u0430.",
    startFailed:
      "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0432\u043e\u043d\u043e\u043a. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0440\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f \u043a\u0430\u043c\u0435\u0440\u044b \u0438 \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u0441\u0435\u0440\u0432\u0435\u0440\u0443.",
    notifyHttps: "\u0414\u043b\u044f \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0439 \u0442\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f HTTPS.",
    notifyBlocked:
      "\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f \u043e\u0442\u043a\u043b\u044e\u0447\u0435\u043d\u044b \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430.",
    notifyEnableFailed:
      "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0443\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f."
  },
  call: {
    roomTitle: "\u041e\u0431\u0449\u0430\u044f \u043a\u043e\u043c\u043d\u0430\u0442\u0430",
    participantsLabel: (count) => {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod10 === 1 && mod100 !== 11) {
        return "\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a";
      }
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return "\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430";
      }
      return "\u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432";
    }
  },
  controls: {
    mute: "\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0437\u0432\u0443\u043a",
    unmute: "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0437\u0432\u0443\u043a",
    cameraOn: "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043a\u0430\u043c\u0435\u0440\u0443",
    cameraOff: "\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043a\u0430\u043c\u0435\u0440\u0443",
    leave: "\u0412\u044b\u0439\u0442\u0438"
  },
  tiles: {
    connecting: "\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435...",
    you: "\u0412\u044b"
  },
  notificationTitle: "Roomtone",
  notificationBody: (name) =>
    `${name} \u043f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u043b\u0441\u044f(\u0430\u0441\u044c) \u043a \u043a\u043e\u043c\u043d\u0430\u0442\u0435.`
};

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isRussianLocale(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const languages = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
  return languages.some((lang) => lang?.toLowerCase().startsWith("ru"));
}

function decodeJwtName(token: string | null): string | null {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(atob(base64UrlToBase64(parts[1]))) as {
      name?: string;
    };
    if (payload?.name && typeof payload.name === "string") {
      return payload.name;
    }
  } catch {
    return null;
  }
  return null;
}

function base64UrlToBase64(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = padded.length % 4 ? 4 - (padded.length % 4) : 0;
  return padded + "=".repeat(padLength);
}

function NotificationPrompt({
  permission,
  onRequest,
  copy
}: {
  permission: NotificationState;
  onRequest: () => void;
  copy: Copy["notifications"];
}) {
  if (permission === "unsupported" || permission === "granted") {
    return null;
  }

  return (
    <div className="notify">
      <div>
        <strong>{copy.title}</strong>
        <p>
          {permission === "denied" ? copy.blocked : copy.prompt}
        </p>
      </div>
      {permission === "default" ? (
        <button className="btn btn--ghost" onClick={onRequest}>
          {copy.action}
        </button>
      ) : null}
    </div>
  );
}

function VideoTile({
  stream,
  name,
  muted,
  isLocal,
  index,
  localLabel,
  connectingLabel
}: {
  stream?: MediaStream;
  name: string;
  muted: boolean;
  isLocal: boolean;
  index: number;
  localLabel: string;
  connectingLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream ?? null;
    }
  }, [stream]);

  return (
    <div
      className={`tile ${!stream ? "tile--empty" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={isLocal ? "tile__video tile__video--local" : "tile__video"}
      />
      <div className="tile__label">
        <span>{name}</span>
        {isLocal ? <em>{localLabel}</em> : null}
      </div>
      {!stream ? (
        <div className="tile__placeholder">{connectingLabel}</div>
      ) : null}
    </div>
  );
}

export default function App() {
  const copy = useMemo(() => (isRussianLocale() ? RU_COPY : EN_COPY), []);
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationState>("default");

  const wsRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const participantCount = joined ? participants.length + 1 : 0;
  const authToken = useMemo(
    () => new URLSearchParams(window.location.search).get("token"),
    []
  );
  const defaultName = useMemo(() => decodeJwtName(authToken), [authToken]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) {
      return;
    }
    url.searchParams.delete("token");
    window.history.replaceState({}, "", url.toString());
  }, [authToken]);

  useEffect(() => {
    if (!name && defaultName) {
      setName(defaultName);
    }
  }, [defaultName, name]);

  const clearConnections = useCallback(() => {
    for (const pc of peerConnectionsRef.current.values()) {
      pc.close();
    }
    peerConnectionsRef.current.clear();
    setRemoteStreams({});
    setParticipants([]);
    myIdRef.current = null;
  }, []);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    clearConnections();
    stopLocalStream();
    setJoined(false);
    setStatus("idle");
  }, [clearConnections, stopLocalStream]);

  const sendSignal = useCallback((to: string, data: SignalPayload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(
      JSON.stringify({
        type: "signal",
        to,
        data
      })
    );
  }, []);

  const requestNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    if (
      window.location.protocol !== "https:" &&
      !isLocalhost(window.location.hostname)
    ) {
      setError(copy.errors.notifyHttps);
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotificationPermission(result);
      if (result === "denied") {
        setError(copy.errors.notifyBlocked);
      }
    } catch {
      setError(copy.errors.notifyEnableFailed);
    }
  }, [copy]);

  const notifyPeerJoined = useCallback((peer: Participant) => {
    if (!("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") {
      return;
    }
    try {
      new Notification(copy.notificationTitle, {
        body: copy.notificationBody(peer.name),
        tag: `peer-${peer.id}`
      });
    } catch {
      // Ignore notification failures.
    }
  }, [copy]);

  const ensurePeerConnection = useCallback(
    (peerId: string) => {
      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) {
        return existing;
      }

      const pc = new RTCPeerConnection({
        iceServers: iceServersRef.current
      });

      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) {
          pc.addTrack(track, local);
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerId, { candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) {
          return;
        }
        setRemoteStreams((prev) => ({
          ...prev,
          [peerId]: stream
        }));
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          peerConnectionsRef.current.delete(peerId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        }
      };

      peerConnectionsRef.current.set(peerId, pc);
      return pc;
    },
    [sendSignal]
  );

  const handleSignal = useCallback(
    async (from: string, data: SignalPayload) => {
      const pc = ensurePeerConnection(from);
      try {
        if (data.description) {
          const description = new RTCSessionDescription(data.description);
          await pc.setRemoteDescription(description);
          if (description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (pc.localDescription) {
              sendSignal(from, { description: pc.localDescription });
            }
          }
          return;
        }

        if (data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch {
            // Ignore candidates from already closed peers.
          }
        }
      } catch {
        setError(copy.errors.signaling);
      }
    },
    [copy, ensurePeerConnection, sendSignal, setError]
  );

  const handlePeerJoined = useCallback(
    async (peer: Participant) => {
      try {
        setParticipants((prev) => [...prev, peer]);
        notifyPeerJoined(peer);
        const pc = ensurePeerConnection(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal(peer.id, { description: pc.localDescription });
        }
      } catch {
        setError(copy.errors.connectPeer);
      }
    },
    [copy, ensurePeerConnection, notifyPeerJoined, sendSignal, setError]
  );

  const handlePeerLeft = useCallback((peerId: string) => {
    setParticipants((prev) => prev.filter((peer) => peer.id !== peerId));
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });

    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
  }, []);

  const wsUrl = useMemo(() => {
    const url = new URL("/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    if (authToken) {
      url.searchParams.set("token", authToken);
    }
    return url.toString();
  }, [authToken]);

  const joinRoom = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(copy.errors.enterName);
      return;
    }

    if (
      window.location.protocol !== "https:" &&
      !isLocalhost(window.location.hostname)
    ) {
      setError(copy.errors.httpsRequired);
      return;
    }

    if (status === "connecting") {
      return;
    }

    setError(null);
    setStatus("connecting");
    setMicMuted(false);
    setCameraOff(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "join",
            name: trimmed
          })
        );
      };

      ws.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          setError(copy.errors.badMessage);
          return;
        }
        if (message.type === "welcome") {
          myIdRef.current = message.id;
          setParticipants(message.participants);
          setJoined(true);
          setStatus("connected");
          return;
        }

        if (message.type === "peer-joined") {
          void handlePeerJoined(message.peer);
          return;
        }

        if (message.type === "peer-left") {
          handlePeerLeft(message.peerId);
          return;
        }

        if (message.type === "signal") {
          void handleSignal(message.from, message.data);
          return;
        }

        if (message.type === "error") {
          setError(message.message);
        }
      };

      ws.onclose = () => {
        if (manualCloseRef.current) {
          manualCloseRef.current = false;
          return;
        }
        setStatus("error");
        setError(copy.errors.connectionClosed);
        wsRef.current = null;
        clearConnections();
        stopLocalStream();
        setJoined(false);
      };

      ws.onerror = () => {
        setStatus("error");
        setError(copy.errors.signaling);
      };
    } catch (err) {
      setStatus("error");
      setError(copy.errors.startFailed);
    }
  }, [
    copy,
    handlePeerJoined,
    handlePeerLeft,
    handleSignal,
    name,
    status,
    wsUrl
  ]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setMicMuted(!track.enabled);
    });
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setCameraOff(!track.enabled);
    });
  }, []);

  const peerTiles = participants.map((peer, index) => (
    <VideoTile
      key={peer.id}
      stream={remoteStreams[peer.id]}
      name={peer.name}
      muted={false}
      isLocal={false}
      index={index + 1}
      localLabel={copy.tiles.you}
      connectingLabel={copy.tiles.connecting}
    />
  ));
  const showLocalInGrid = participants.length === 0;
  const localTile = (
    <VideoTile
      stream={localStream ?? undefined}
      name={name}
      muted={true}
      isLocal={true}
      index={0}
      localLabel={copy.tiles.you}
      connectingLabel={copy.tiles.connecting}
    />
  );

  return (
    <div className="app">
      <div className="glow" />
      <header className="app__header">
        <div className="brand">
          <div className="brand__mark">RT</div>
          <div>
            <p className="brand__name">Roomtone</p>
            <p className="brand__tag">{copy.brandTagline}</p>
          </div>
        </div>
        <div className="status" data-testid="status-label">
          <span
            className={`status__dot status__dot--${status}`}
            aria-hidden="true"
          />
          <span>
            {status === "connected"
              ? copy.status.connected
              : status === "connecting"
                ? copy.status.connecting
                : status === "error"
                  ? copy.status.error
                  : copy.status.idle}
          </span>
        </div>
      </header>

      {!joined ? (
        <section className="join">
          <div className="join__card">
            <h1>{copy.join.title}</h1>
            <p>{copy.join.subtitle}</p>
            <label className="join__field">
              <span>{copy.join.nameLabel}</span>
              <input
                data-testid="join-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    joinRoom();
                  }
                }}
                placeholder={copy.join.namePlaceholder}
                autoComplete="name"
              />
            </label>
            {error ? <div className="join__error">{error}</div> : null}
            <button
              data-testid="join-button"
              className="btn btn--primary"
              onClick={joinRoom}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? copy.join.joining : copy.join.button}
            </button>
            <NotificationPrompt
              permission={notificationPermission}
              onRequest={requestNotifications}
              copy={copy.notifications}
            />
            <div className="join__hint">{copy.join.hint}</div>
          </div>
        </section>
      ) : (
        <main className="call">
          <div className="call__header">
            <div>
              <h2>{copy.call.roomTitle}</h2>
              <p className="call__meta">
                <span data-testid="participant-count">{participantCount}</span>
                <span>{copy.call.participantsLabel(participantCount)}</span>
              </p>
            </div>
            <div className="controls">
              <button className="btn btn--ghost" onClick={toggleMic}>
                {micMuted ? copy.controls.unmute : copy.controls.mute}
              </button>
              <button className="btn btn--ghost" onClick={toggleCamera}>
                {cameraOff ? copy.controls.cameraOn : copy.controls.cameraOff}
              </button>
              <button className="btn btn--danger" onClick={disconnect}>
                {copy.controls.leave}
              </button>
            </div>
          </div>
          <NotificationPrompt
            permission={notificationPermission}
            onRequest={requestNotifications}
            copy={copy.notifications}
          />
          <div className="call__stage">
            <div
              className={`video-grid ${showLocalInGrid ? "video-grid--solo" : ""}`}
            >
              {showLocalInGrid ? localTile : null}
              {peerTiles}
            </div>
            {!showLocalInGrid ? (
              <div className="local-preview">{localTile}</div>
            ) : null}
          </div>
        </main>
      )}
    </div>
  );
}
