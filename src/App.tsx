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
type MediaTransport = "webrtc" | "ws";
type MediaPeer = { id: string; mimeType: string };

type ServerMessage =
  | {
      type: "welcome";
      id: string;
      participants: Participant[];
      iceServers?: RTCIceServer[];
      iceTransportPolicy?: RTCIceTransportPolicy;
      mediaTransport?: MediaTransport;
      mediaPeers?: MediaPeer[];
    }
  | { type: "peer-joined"; peer: Participant }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload }
  | { type: "media-start"; peerId: string; mimeType: string }
  | { type: "media-stop"; peerId: string }
  | { type: "entropy"; bytes?: number; data?: string }
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
    browserUnsupported: string;
    browserWebrtcOnly: string;
    enterName: string;
    httpsRequired: string;
    badMessage: string;
    connectPeer: string;
    connectionClosed: string;
    signaling: string;
    startFailed: string;
    mediaUnsupported: string;
    webrtcUnsupported: string;
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
    browserUnsupported:
      "This browser is not compatible. Use Chrome or Edge 120+, or Firefox 121+ with WebRTC mode. Safari is not supported for WebSocket media.",
    browserWebrtcOnly:
      "This browser can only join when WebRTC mode is enabled. Use Chrome or Edge 120+ for WebSocket media.",
    enterName: "Enter a name to join the room.",
    httpsRequired: "HTTPS is required to join the room.",
    badMessage: "Bad message from server.",
    connectPeer: "Unable to connect to a peer.",
    connectionClosed: "Connection closed.",
    signaling: "Signaling error.",
    startFailed:
      "Unable to start the call. Check camera permissions and server access.",
    mediaUnsupported:
      "WebSocket media is not supported in this browser. Use Chrome or Edge 120+, or Firefox 121+ with WebRTC mode.",
    webrtcUnsupported:
      "WebRTC is not supported in this browser. Use Chrome or Edge 120+.",
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
  brandTagline: "Одна комната. Живые голоса.",
  status: {
    connected: "В эфире",
    connecting: "Соединяем",
    error: "Офлайн",
    idle: "Ожидание"
  },
  join: {
    title: "Войти в комнату",
    subtitle:
      "Все встречаются в одной виртуальной комнате. Включите микрофон и камеру — и вы в эфире.",
    nameLabel: "Ваше имя",
    namePlaceholder: "например, Таня",
    button: "Присоединиться",
    joining: "Подключаемся...",
    hint: "Для лучшего качества разрешите доступ к камере и микрофону."
  },
  notifications: {
    title: "Будьте в курсе.",
    blocked: "Уведомления отключены в настройках браузера.",
    prompt:
      "Включите уведомления, чтобы знать, когда кто-то присоединяется к комнате.",
    action: "Включить уведомления"
  },
  errors: {
    browserUnsupported:
      "Этот браузер несовместим. Используйте Chrome или Edge 120+, либо Firefox 121+ в режиме WebRTC. Safari не поддерживает медиа через WebSocket.",
    browserWebrtcOnly:
      "Этот браузер работает только в режиме WebRTC. Для медиа через WebSocket нужен Chrome или Edge 120+.",
    enterName: "Введите имя, чтобы присоединиться.",
    httpsRequired: "Для входа требуется HTTPS.",
    badMessage: "Некорректное сообщение от сервера.",
    connectPeer: "Не удалось подключиться к участнику.",
    connectionClosed: "Соединение закрыто.",
    signaling: "Ошибка сигналинга.",
    startFailed:
      "Не удалось начать звонок. Проверьте разрешения камеры и доступ к серверу.",
    mediaUnsupported:
      "Медиа через WebSocket не поддерживается в этом браузере. Используйте Chrome или Edge 120+, либо Firefox 121+ в режиме WebRTC.",
    webrtcUnsupported:
      "WebRTC не поддерживается в этом браузере. Используйте Chrome или Edge 120+.",
    notifyHttps: "Для уведомлений требуется HTTPS.",
    notifyBlocked: "Уведомления отключены в настройках браузера.",
    notifyEnableFailed: "Не удалось включить уведомления."
  },
  call: {
    roomTitle: "Общая комната",
    participantsLabel: (count) => {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod10 === 1 && mod100 !== 11) {
        return "участник";
      }
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return "участника";
      }
      return "участников";
    }
  },
  controls: {
    mute: "Выключить звук",
    unmute: "Включить звук",
    cameraOn: "Включить камеру",
    cameraOff: "Выключить камеру",
    leave: "Выйти"
  },
  tiles: {
    connecting: "Подключение...",
    you: "Вы"
  },
  notificationTitle: "Roomtone",
  notificationBody: (name) => `${name} присоединился(ась) к комнате.`
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

type BrowserSupport = {
  hasWebSocket: boolean;
  hasMediaDevices: boolean;
  hasMediaRecorder: boolean;
  hasMediaSource: boolean;
  hasWebrtc: boolean;
};

function detectBrowserSupport(): BrowserSupport {
  if (typeof window === "undefined") {
    return {
      hasWebSocket: false,
      hasMediaDevices: false,
      hasMediaRecorder: false,
      hasMediaSource: false,
      hasWebrtc: false
    };
  }
  return {
    hasWebSocket: typeof WebSocket !== "undefined",
    hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    hasMediaRecorder: typeof MediaRecorder !== "undefined",
    hasMediaSource: typeof MediaSource !== "undefined",
    hasWebrtc: typeof RTCPeerConnection !== "undefined"
  };
}

const ENTROPY_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ENTROPY_MIN_CHARS = 128;
const ENTROPY_MAX_CHARS = 1024;
const ENTROPY_MIN_DELAY_MS = 1500;
const ENTROPY_MAX_DELAY_MS = 3500;
const MEDIA_CHUNK_MS = 250;
const MEDIA_QUEUE_LIMIT = 24;
const MEDIA_MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const MEDIA_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=\"avc1.42E01E,mp4a.40.2\""
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomEntropyString(length: number): string {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    return Array.from({ length }, () =>
      ENTROPY_ALPHABET[Math.floor(Math.random() * ENTROPY_ALPHABET.length)]
    ).join("");
  }
  const bytes = new Uint8Array(length);
  cryptoApi.getRandomValues(bytes);
  let result = "";
  for (const value of bytes) {
    result += ENTROPY_ALPHABET[value % ENTROPY_ALPHABET.length];
  }
  return result;
}

const MEDIA_PACKET_VERSION = 1;
const mediaTextDecoder = new TextDecoder();

function pickMediaMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of MEDIA_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseMediaPacket(
  data: ArrayBuffer
): { peerId: string; payload: Uint8Array } | null {
  const view = new Uint8Array(data);
  if (view.length < 3) {
    return null;
  }
  if (view[0] !== MEDIA_PACKET_VERSION) {
    return null;
  }
  const idLength = view[1];
  if (idLength <= 0 || view.length <= 2 + idLength) {
    return null;
  }
  const peerId = mediaTextDecoder.decode(view.slice(2, 2 + idLength));
  if (!peerId) {
    return null;
  }
  return {
    peerId,
    payload: view.slice(2 + idLength)
  };
}

type ClientLogLevel = "debug" | "info" | "warn" | "error";

type ClientLogPayload = {
  level: ClientLogLevel;
  event: string;
  message?: string;
  details?: Record<string, unknown> | string;
  sessionId: string;
  url: string;
  userAgent?: string;
  timestamp: string;
  joined: boolean;
};

const NAME_STORAGE_KEY = "roomtone_name";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredName(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredName(value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(NAME_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

function sanitizeClientUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
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

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return value.slice(0, limit);
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function postClientLog(payload: ClientLogPayload): void {
  if (typeof window === "undefined") {
    return;
  }
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/logs", blob);
    return;
  }
  void fetch("/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true
  });
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
  src,
  name,
  muted,
  isLocal,
  index,
  localLabel,
  connectingLabel
}: {
  stream?: MediaStream;
  src?: string;
  name: string;
  muted: boolean;
  isLocal: boolean;
  index: number;
  localLabel: string;
  connectingLabel: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) {
      return;
    }
    if (stream) {
      node.srcObject = stream;
      node.removeAttribute("src");
      return;
    }
    node.srcObject = null;
    if (src) {
      node.src = src;
    } else {
      node.removeAttribute("src");
    }
  }, [stream, src]);

  return (
    <div
      className={`tile ${!stream && !src ? "tile--empty" : ""}`}
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
      {!stream && !src ? (
        <div className="tile__placeholder">{connectingLabel}</div>
      ) : null}
    </div>
  );
}

export default function App() {
  const copy = useMemo(() => (isRussianLocale() ? RU_COPY : EN_COPY), []);
  const sessionId = useMemo(() => createSessionId(), []);
  const browserSupport = useMemo(() => detectBrowserSupport(), []);
  const [name, setName] = useState(() => readStoredName());
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [remoteMediaUrls, setRemoteMediaUrls] = useState<
    Record<string, string>
  >({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [mediaTransport, setMediaTransport] =
    useState<MediaTransport>("ws");
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationState>("default");
  const [isCompactLandscape, setIsCompactLandscape] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(max-height: 520px) and (orientation: landscape)")
      .matches;
  });

  const logClient = useCallback(
    (
      level: ClientLogLevel,
      event: string,
      message?: string,
      details?: Record<string, unknown> | string
    ) => {
      const trimmedEvent = event.trim();
      if (!trimmedEvent) {
        return;
      }
      const url =
        typeof window === "undefined"
          ? ""
          : sanitizeClientUrl(window.location.href);
      const userAgent =
        typeof navigator === "undefined"
          ? undefined
          : truncateText(navigator.userAgent, 200);
      postClientLog({
        level,
        event: truncateText(trimmedEvent, 80),
        message: message ? truncateText(message, 500) : undefined,
        details,
        sessionId,
        url,
        userAgent,
        timestamp: new Date().toISOString(),
        joined
      });
    },
    [joined, sessionId]
  );

  const wsRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const iceTransportPolicyRef = useRef<RTCIceTransportPolicy | undefined>(
    undefined
  );
  const entropyTimerRef = useRef<number | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteMediaRef = useRef(
    new Map<
      string,
      {
        url: string;
        mediaSource: MediaSource;
        sourceBuffer: SourceBuffer | null;
        queue: Uint8Array[];
        mimeType: string;
      }
    >()
  );
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaMimeTypeRef = useRef<string | null>(null);
  const mediaTransportRef = useRef<MediaTransport>("ws");

  const participantCount = joined ? participants.length + 1 : 0;
  const authToken = useMemo(
    () => new URLSearchParams(window.location.search).get("token"),
    []
  );
  const isBaseSupported =
    browserSupport.hasWebSocket && browserSupport.hasMediaDevices;
  const isWsSupported =
    isBaseSupported &&
    browserSupport.hasMediaRecorder &&
    browserSupport.hasMediaSource;
  const isWebrtcSupported = isBaseSupported && browserSupport.hasWebrtc;
  const isFullyUnsupported = !isWsSupported && !isWebrtcSupported;
  const compatibilityMessage = useMemo(() => {
    if (!isBaseSupported) {
      return copy.errors.browserUnsupported;
    }
    if (!isWsSupported && isWebrtcSupported) {
      return copy.errors.browserWebrtcOnly;
    }
    if (isFullyUnsupported) {
      return copy.errors.browserUnsupported;
    }
    return null;
  }, [
    copy.errors.browserUnsupported,
    copy.errors.browserWebrtcOnly,
    isBaseSupported,
    isFullyUnsupported,
    isWebrtcSupported,
    isWsSupported
  ]);

  useEffect(() => {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    mediaTransportRef.current = mediaTransport;
  }, [mediaTransport]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }
    const media = window.matchMedia(
      "(max-height: 520px) and (orientation: landscape)"
    );
    const handler = (event: MediaQueryListEvent) => {
      setIsCompactLandscape(event.matches);
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
    } else {
      media.addListener(handler);
    }
    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handler);
      } else {
        media.removeListener(handler);
      }
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hadToken = url.searchParams.has("token");
    const hadName = url.searchParams.has("name");
    if (!hadToken && !hadName) {
      return;
    }
    if (hadToken) {
      url.searchParams.delete("token");
    }
    if (hadName) {
      url.searchParams.delete("name");
    }
    window.history.replaceState({}, "", url.toString());
  }, [authToken]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logClient("error", "window_error", event.message, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno
      });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      logClient("error", "unhandled_rejection", stringifyError(event.reason));
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [logClient]);

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed) {
      writeStoredName(trimmed);
    }
  }, [name]);

  const removeRemoteMedia = useCallback(
    (peerId: string) => {
      const remote = remoteMediaRef.current.get(peerId);
      if (!remote) {
        return;
      }
      remoteMediaRef.current.delete(peerId);
      try {
        if (remote.mediaSource.readyState === "open") {
          remote.mediaSource.endOfStream();
        }
      } catch {
        // Ignore MSE shutdown errors.
      }
      URL.revokeObjectURL(remote.url);
      setRemoteMediaUrls((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    },
    [setRemoteMediaUrls]
  );

  const clearRemoteMedia = useCallback(() => {
    for (const peerId of remoteMediaRef.current.keys()) {
      removeRemoteMedia(peerId);
    }
  }, [removeRemoteMedia]);

  const ensureRemoteMedia = useCallback(
    (peerId: string, mimeType: string) => {
      if (typeof MediaSource === "undefined") {
        setError(copy.errors.mediaUnsupported);
        logClient("error", "media_unsupported", "media_source_missing");
        return;
      }
      if (MediaSource.isTypeSupported && !MediaSource.isTypeSupported(mimeType)) {
        logClient("warn", "media_unsupported_type", mimeType, { peerId });
        return;
      }
      const existing = remoteMediaRef.current.get(peerId);
      if (existing && existing.mimeType === mimeType) {
        return;
      }
      if (existing) {
        removeRemoteMedia(peerId);
      }

      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      const remote = {
        url,
        mediaSource,
        sourceBuffer: null as SourceBuffer | null,
        queue: [] as Uint8Array[],
        mimeType
      };
      remoteMediaRef.current.set(peerId, remote);
      setRemoteMediaUrls((prev) => ({ ...prev, [peerId]: url }));

      const flushQueue = () => {
        if (!remote.sourceBuffer || remote.sourceBuffer.updating) {
          return;
        }
        const next = remote.queue.shift();
        if (!next) {
          return;
        }
        try {
          remote.sourceBuffer.appendBuffer(next);
        } catch (err) {
          logClient("warn", "media_append_failed", stringifyError(err), { peerId });
          remote.queue.length = 0;
        }
      };

      mediaSource.addEventListener("sourceopen", () => {
        if (remote.sourceBuffer) {
          return;
        }
        try {
          const buffer = mediaSource.addSourceBuffer(mimeType);
          buffer.mode = "sequence";
          buffer.addEventListener("updateend", flushQueue);
          remote.sourceBuffer = buffer;
          flushQueue();
        } catch (err) {
          logClient("error", "media_source_failed", stringifyError(err), {
            peerId,
            mimeType
          });
        }
      });
    },
    [copy.errors.mediaUnsupported, logClient, removeRemoteMedia, setError]
  );

  const appendRemoteChunk = useCallback(
    (peerId: string, payload: Uint8Array) => {
      const remote = remoteMediaRef.current.get(peerId);
      if (!remote) {
        return;
      }
      if (!remote.sourceBuffer || remote.sourceBuffer.updating) {
        if (remote.queue.length >= MEDIA_QUEUE_LIMIT) {
          remote.queue.shift();
          logClient("warn", "media_queue_drop", "queue_overflow", { peerId });
        }
        remote.queue.push(payload);
        return;
      }
      try {
        remote.sourceBuffer.appendBuffer(payload);
      } catch (err) {
        logClient("warn", "media_append_failed", stringifyError(err), { peerId });
      }
    },
    [logClient]
  );

  const handleMediaPacket = useCallback(
    (data: ArrayBuffer) => {
      const parsed = parseMediaPacket(data);
      if (!parsed) {
        logClient("warn", "media_packet_invalid");
        return;
      }
      appendRemoteChunk(parsed.peerId, parsed.payload);
    },
    [appendRemoteChunk, logClient]
  );

  const clearConnections = useCallback(() => {
    for (const pc of peerConnectionsRef.current.values()) {
      pc.close();
    }
    peerConnectionsRef.current.clear();
    setRemoteStreams({});
    clearRemoteMedia();
    setParticipants([]);
    myIdRef.current = null;
  }, [clearRemoteMedia]);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const stopWsMedia = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    mediaMimeTypeRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore recorder shutdown errors.
      }
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "media-stop" }));
    }
  }, []);

  const stopEntropyLoop = useCallback(() => {
    if (entropyTimerRef.current === null) {
      return;
    }
    window.clearTimeout(entropyTimerRef.current);
    entropyTimerRef.current = null;
  }, []);

  const startEntropyLoop = useCallback(() => {
    stopEntropyLoop();
    const scheduleNext = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        entropyTimerRef.current = null;
        return;
      }
      const size = randomInt(ENTROPY_MIN_CHARS, ENTROPY_MAX_CHARS);
      ws.send(
        JSON.stringify({
          type: "entropy",
          bytes: size,
          data: randomEntropyString(size)
        })
      );
      entropyTimerRef.current = window.setTimeout(
        scheduleNext,
        randomInt(ENTROPY_MIN_DELAY_MS, ENTROPY_MAX_DELAY_MS)
      );
    };
    entropyTimerRef.current = window.setTimeout(
      scheduleNext,
      randomInt(ENTROPY_MIN_DELAY_MS, ENTROPY_MAX_DELAY_MS)
    );
  }, [stopEntropyLoop]);

  const startWsMedia = useCallback(() => {
    if (mediaRecorderRef.current) {
      return;
    }
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const mimeType = pickMediaMimeType();
    if (!mimeType || typeof MediaRecorder === "undefined") {
      setError(copy.errors.mediaUnsupported);
      logClient("error", "media_unsupported", "media_recorder_missing");
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      mediaMimeTypeRef.current = mimeType;

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) {
          return;
        }
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          return;
        }
        if (ws.bufferedAmount > MEDIA_MAX_BUFFERED_BYTES) {
          logClient("warn", "media_backpressure", "buffered", {
            bufferedBytes: ws.bufferedAmount
          });
          return;
        }
        const payload = await event.data.arrayBuffer();
        ws.send(payload);
      };

      recorder.onerror = (event) => {
        logClient("error", "media_recorder_error", stringifyError(event));
      };

      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "media-start", mimeType }));
      }
      recorder.start(MEDIA_CHUNK_MS);
      logClient("info", "media_recorder_start", undefined, {
        mimeType,
        chunkMs: MEDIA_CHUNK_MS
      });
    } catch (err) {
      logClient("error", "media_recorder_error", stringifyError(err));
      setError(copy.errors.mediaUnsupported);
    }
  }, [copy.errors.mediaUnsupported, logClient, setError]);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    stopEntropyLoop();
    if (mediaTransportRef.current === "ws") {
      stopWsMedia();
    }
    wsRef.current?.close();
    wsRef.current = null;
    clearConnections();
    stopLocalStream();
    setJoined(false);
    setStatus("idle");
    logClient("info", "disconnect", "manual");
  }, [clearConnections, logClient, stopEntropyLoop, stopLocalStream, stopWsMedia]);

  const sendSignal = useCallback((to: string, data: SignalPayload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    if (mediaTransportRef.current !== "webrtc") {
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
        iceServers: iceServersRef.current,
        iceTransportPolicy: iceTransportPolicyRef.current
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

      pc.onicecandidateerror = (event) => {
        logClient("warn", "ice_candidate_error", event.errorText || "ICE candidate error", {
          peerId,
          errorCode: event.errorCode,
          url: event.url
        });
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

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === "failed" || state === "disconnected") {
          logClient("warn", "ice_connection_state", state, { peerId });
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          logClient("warn", "rtc_connection_state", pc.connectionState, { peerId });
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
    [logClient, sendSignal]
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
      } catch (err) {
        logClient("error", "signal_error", stringifyError(err), { peerId: from });
        setError(copy.errors.signaling);
      }
    },
    [copy, ensurePeerConnection, logClient, sendSignal, setError]
  );

  const addParticipant = useCallback(
    (peer: Participant) => {
      setParticipants((prev) => {
        if (prev.some((item) => item.id === peer.id)) {
          return prev;
        }
        return [...prev, peer];
      });
      notifyPeerJoined(peer);
    },
    [notifyPeerJoined]
  );

  const connectPeerWebrtc = useCallback(
    async (peer: Participant) => {
      try {
        const pc = ensurePeerConnection(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal(peer.id, { description: pc.localDescription });
        }
      } catch (err) {
        logClient("error", "peer_connect_error", stringifyError(err), {
          peerId: peer.id
        });
        setError(copy.errors.connectPeer);
      }
    },
    [copy, ensurePeerConnection, logClient, sendSignal, setError]
  );

  const removeParticipant = useCallback(
    (peerId: string) => {
      setParticipants((prev) => prev.filter((peer) => peer.id !== peerId));
      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      removeRemoteMedia(peerId);

      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }
    },
    [removeRemoteMedia]
  );

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
      logClient("warn", "join_validation", "name_required");
      return;
    }

    if (!isBaseSupported) {
      setError(copy.errors.browserUnsupported);
      logClient("warn", "join_validation", "browser_unsupported");
      return;
    }
    if (isFullyUnsupported) {
      setError(copy.errors.browserUnsupported);
      logClient("warn", "join_validation", "browser_incompatible");
      return;
    }

    if (
      window.location.protocol !== "https:" &&
      !isLocalhost(window.location.hostname)
    ) {
      setError(copy.errors.httpsRequired);
      logClient("warn", "join_validation", "https_required");
      return;
    }

    if (status === "connecting") {
      return;
    }

    setError(null);
    setStatus("connecting");
    setMicMuted(false);
    setCameraOff(false);
    logClient("info", "join_attempt", undefined, { nameLength: trimmed.length });

    try {
      logClient("info", "media_request");
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
      logClient("info", "media_ready", undefined, {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        logClient("info", "ws_open");
        ws.send(
          JSON.stringify({
            type: "join",
            name: trimmed
          })
        );
        startEntropyLoop();
      };

      ws.binaryType = "arraybuffer";
      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          handleMediaPacket(event.data);
          return;
        }
        if (typeof event.data !== "string") {
          logClient("warn", "ws_message_invalid", "unsupported_payload");
          return;
        }
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          logClient("warn", "ws_message_invalid", "invalid_json");
          setError(copy.errors.badMessage);
          return;
        }
        if (message.type === "welcome") {
          const transport = message.mediaTransport ?? "webrtc";
          setMediaTransport(transport);
          mediaTransportRef.current = transport;
          myIdRef.current = message.id;
          iceServersRef.current = message.iceServers ?? [];
          iceTransportPolicyRef.current =
            message.iceTransportPolicy ?? "all";
          setParticipants(message.participants);
          setJoined(true);
          setStatus("connected");
          logClient("info", "media_transport", transport);
          if (transport === "webrtc") {
            logClient("info", "ice_config", undefined, {
              servers: iceServersRef.current.length,
              policy: iceTransportPolicyRef.current ?? "all"
            });
          }
          logClient("info", "joined_room", undefined, {
            participants: message.participants.length + 1
          });
          if (transport === "ws") {
            if (!isWsSupported) {
              setStatus("error");
              setError(copy.errors.mediaUnsupported);
              logClient("error", "media_unsupported", "ws_required");
              ws.close();
              clearConnections();
              stopLocalStream();
              setJoined(false);
              return;
            }
            message.mediaPeers?.forEach((peer) => {
              ensureRemoteMedia(peer.id, peer.mimeType);
            });
            startWsMedia();
          }
          if (transport === "webrtc" && !isWebrtcSupported) {
            setStatus("error");
            setError(copy.errors.webrtcUnsupported);
            logClient("error", "media_unsupported", "webrtc_required");
            ws.close();
            clearConnections();
            stopLocalStream();
            setJoined(false);
            return;
          }
          return;
        }

        if (message.type === "peer-joined") {
          addParticipant(message.peer);
          if (mediaTransportRef.current === "webrtc") {
            void connectPeerWebrtc(message.peer);
          }
          return;
        }

        if (message.type === "peer-left") {
          removeParticipant(message.peerId);
          return;
        }

        if (message.type === "media-start") {
          if (mediaTransportRef.current === "ws") {
            ensureRemoteMedia(message.peerId, message.mimeType);
          }
          return;
        }

        if (message.type === "media-stop") {
          removeRemoteMedia(message.peerId);
          return;
        }

        if (message.type === "signal") {
          if (mediaTransportRef.current === "webrtc") {
            void handleSignal(message.from, message.data);
          }
          return;
        }

        if (message.type === "error") {
          logClient("warn", "server_error", message.message);
          setError(message.message);
        }
      };

      ws.onclose = (event) => {
        stopEntropyLoop();
        logClient("warn", "ws_close", undefined, {
          code: event.code,
          reason: event.reason
        });
        if (manualCloseRef.current) {
          manualCloseRef.current = false;
          return;
        }
        if (mediaTransportRef.current === "ws") {
          stopWsMedia();
        }
        setStatus("error");
        setError(copy.errors.connectionClosed);
        wsRef.current = null;
        clearConnections();
        stopLocalStream();
        setJoined(false);
      };

      ws.onerror = () => {
        stopEntropyLoop();
        if (mediaTransportRef.current === "ws") {
          stopWsMedia();
        }
        logClient("error", "ws_error");
        setStatus("error");
        setError(copy.errors.signaling);
      };
    } catch (err) {
      logClient("error", "start_failed", stringifyError(err));
      setStatus("error");
      setError(copy.errors.startFailed);
    }
  }, [
    addParticipant,
    clearConnections,
    connectPeerWebrtc,
    copy,
    ensureRemoteMedia,
    handleMediaPacket,
    handleSignal,
    logClient,
    name,
    removeParticipant,
    removeRemoteMedia,
    startEntropyLoop,
    startWsMedia,
    status,
    stopEntropyLoop,
    stopLocalStream,
    stopWsMedia,
    wsUrl,
    isBaseSupported,
    isFullyUnsupported,
    isWebrtcSupported,
    isWsSupported
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
      stream={mediaTransport === "webrtc" ? remoteStreams[peer.id] : undefined}
      src={mediaTransport === "ws" ? remoteMediaUrls[peer.id] : undefined}
      name={peer.name}
      muted={false}
      isLocal={false}
      index={index + 1}
      localLabel={copy.tiles.you}
      connectingLabel={copy.tiles.connecting}
    />
  ));
  const showLocalInGrid = participants.length === 0 || isCompactLandscape;
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

  const displayError = compatibilityMessage ?? error;

  return (
    <div className={joined ? "app app--call" : "app"}>
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
            {displayError ? (
              <div className="join__error">{displayError}</div>
            ) : null}
            <button
              data-testid="join-button"
              className="btn btn--primary"
              onClick={joinRoom}
              disabled={
                status === "connecting" || !isBaseSupported || isFullyUnsupported
              }
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
          {displayError ? (
            <div className="call__error">{displayError}</div>
          ) : null}
          <NotificationPrompt
            permission={notificationPermission}
            onRequest={requestNotifications}
            copy={copy.notifications}
          />
          <div className="call__stage">
            <div
              className={`video-grid ${
                participants.length === 0 ? "video-grid--solo" : ""
              }`}
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
