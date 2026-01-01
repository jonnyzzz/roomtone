import { describe, expect, it } from "vitest";
import { buildIceServers, normalizeHost } from "../../server/config";

describe("normalizeHost", () => {
  it("strips ports", () => {
    expect(normalizeHost("example.com:5670")).toBe("example.com");
  });

  it("handles ipv6 hosts", () => {
    expect(normalizeHost("[2001:db8::1]:3478")).toBe("2001:db8::1");
  });
});

describe("buildIceServers", () => {
  it("uses ICE_SERVERS_JSON when set", () => {
    const env = {
      ICE_SERVERS_JSON: JSON.stringify([
        {
          urls: "turn:turn.example.com:3478",
          username: "user",
          credential: "pass"
        }
      ])
    };
    const config = buildIceServers(env, "example.com");
    expect(config.iceServers).toHaveLength(1);
    expect(config.publicHost).toBe("example.com");
  });

  it("builds TURN servers from env", () => {
    const env = {
      TURN_HOST: "turn.local",
      TURN_USERNAME: "u",
      TURN_PASSWORD: "p",
      TURN_PORT: "3478",
      TURN_TLS_PORT: "5349"
    };
    const config = buildIceServers(env, "ignored");
    expect(config.iceServers.length).toBeGreaterThan(0);
    expect(config.iceServers[0]?.urls).toEqual([
      "turn:turn.local:3478?transport=udp",
      "turn:turn.local:3478?transport=tcp"
    ]);
  });
});
