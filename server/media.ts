const MEDIA_PACKET_VERSION = 1;
const MAX_PEER_ID_BYTES = 120;

export type MediaPacket = {
  version: number;
  peerId: string;
  payload: Buffer;
};

export function buildMediaPacket(peerId: string, payload: Buffer): Buffer {
  if (!peerId) {
    throw new Error("peerId is required.");
  }
  const peerIdBytes = Buffer.from(peerId, "utf8");
  if (peerIdBytes.length === 0 || peerIdBytes.length > MAX_PEER_ID_BYTES) {
    throw new Error("peerId length is invalid.");
  }
  if (payload.length === 0) {
    throw new Error("payload is empty.");
  }
  const header = Buffer.allocUnsafe(2 + peerIdBytes.length);
  header[0] = MEDIA_PACKET_VERSION;
  header[1] = peerIdBytes.length;
  peerIdBytes.copy(header, 2);
  return Buffer.concat([header, payload]);
}

export function parseMediaPacket(data: Buffer): MediaPacket | null {
  if (data.length < 3) {
    return null;
  }
  const version = data[0];
  if (version !== MEDIA_PACKET_VERSION) {
    return null;
  }
  const idLength = data[1];
  if (idLength <= 0 || idLength > MAX_PEER_ID_BYTES) {
    return null;
  }
  const headerLength = 2 + idLength;
  if (data.length <= headerLength) {
    return null;
  }
  const peerId = data.slice(2, headerLength).toString("utf8");
  if (!peerId) {
    return null;
  }
  return {
    version,
    peerId,
    payload: data.slice(headerLength)
  };
}
