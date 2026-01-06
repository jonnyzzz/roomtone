import { describe, expect, it } from "vitest";
import { buildMediaPacket, parseMediaPacket } from "../../server/media";

describe("media packet framing", () => {
  it("encodes and decodes peer packets", () => {
    const payload = Buffer.from("payload");
    const packet = buildMediaPacket("peer-1", payload);
    const parsed = parseMediaPacket(packet);
    expect(parsed).not.toBeNull();
    expect(parsed?.peerId).toBe("peer-1");
    expect(parsed?.payload.toString()).toBe("payload");
  });

  it("rejects unsupported versions", () => {
    const payload = Buffer.from("data");
    const packet = buildMediaPacket("peer-2", payload);
    packet[0] = 7;
    expect(parseMediaPacket(packet)).toBeNull();
  });
});
