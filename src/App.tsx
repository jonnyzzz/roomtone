import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Participant = {
  id: string;
  name: string;
};

type SignalPayload = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type ServerMessage =
  | { type: "welcome"; id: string; participants: Participant[] }
  | { type: "peer-joined"; peer: Participant }
  | { type: "peer-left"; peerId: string }
  | { type: "signal"; from: string; data: SignalPayload }
  | { type: "error"; message: string };

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function VideoTile({
  stream,
  name,
  muted,
  isLocal,
  index
}: {
  stream?: MediaStream;
  name: string;
  muted: boolean;
  isLocal: boolean;
  index: number;
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
        {isLocal ? <em>You</em> : null}
      </div>
      {!stream ? <div className="tile__placeholder">Connecting...</div> : null}
    </div>
  );
}

export default function App() {
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

  const wsRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  const myIdRef = useRef<string | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const participantCount = joined ? participants.length + 1 : 0;

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
        setError("Signaling error.");
      }
    },
    [ensurePeerConnection, sendSignal, setError]
  );

  const handlePeerJoined = useCallback(
    async (peer: Participant) => {
      try {
        setParticipants((prev) => [...prev, peer]);
        const pc = ensurePeerConnection(peer.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal(peer.id, { description: pc.localDescription });
        }
      } catch {
        setError("Unable to connect to a peer.");
      }
    },
    [ensurePeerConnection, sendSignal, setError]
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
    return url.toString();
  }, []);

  const joinRoom = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name to join the room.");
      return;
    }

    if (
      window.location.protocol !== "https:" &&
      !isLocalhost(window.location.hostname)
    ) {
      setError("HTTPS is required to join the room.");
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
          setError("Bad message from server.");
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
        setError("Connection closed.");
        wsRef.current = null;
        clearConnections();
        stopLocalStream();
        setJoined(false);
      };

      ws.onerror = () => {
        setStatus("error");
        setError("Signaling error.");
      };
    } catch (err) {
      setStatus("error");
      setError(
        "Unable to start the call. Check camera permissions and server access."
      );
    }
  }, [handlePeerJoined, handlePeerLeft, handleSignal, name, status, wsUrl]);

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
    />
  ));

  return (
    <div className="app">
      <div className="glow" />
      <header className="app__header">
        <div className="brand">
          <div className="brand__mark">RT</div>
          <div>
            <p className="brand__name">Roomtone</p>
            <p className="brand__tag">One room. Real voices.</p>
          </div>
        </div>
        <div className="status" data-testid="status-label">
          <span
            className={`status__dot status__dot--${status}`}
            aria-hidden="true"
          />
          <span>
            {status === "connected"
              ? "Live"
              : status === "connecting"
                ? "Dialing"
                : status === "error"
                  ? "Offline"
                  : "Idle"}
          </span>
        </div>
      </header>

      {!joined ? (
        <section className="join">
          <div className="join__card">
            <h1>Enter the room</h1>
            <p>
              Everyone meets in a single virtual room. Bring your mic and camera
              and you are in.
            </p>
            <label className="join__field">
              <span>Your name</span>
              <input
                data-testid="join-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    joinRoom();
                  }
                }}
                placeholder="e.g. Tania"
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
              {status === "connecting" ? "Joining..." : "Join room"}
            </button>
            <div className="join__hint">
              For best results, allow camera and microphone when prompted.
            </div>
          </div>
        </section>
      ) : (
        <main className="call">
          <div className="call__header">
            <div>
              <h2>Global room</h2>
              <p className="call__meta">
                <span data-testid="participant-count">{participantCount}</span>
                <span>participants</span>
              </p>
            </div>
            <div className="controls">
              <button className="btn btn--ghost" onClick={toggleMic}>
                {micMuted ? "Unmute" : "Mute"}
              </button>
              <button className="btn btn--ghost" onClick={toggleCamera}>
                {cameraOff ? "Camera on" : "Camera off"}
              </button>
              <button className="btn btn--danger" onClick={disconnect}>
                Leave
              </button>
            </div>
          </div>
          <div className="video-grid">
            <VideoTile
              stream={localStream ?? undefined}
              name={name}
              muted={true}
              isLocal={true}
              index={0}
            />
            {peerTiles}
          </div>
        </main>
      )}
    </div>
  );
}
