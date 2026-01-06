import { describe, expect, it } from "vitest";
import { parseIceServers, parseIceTransportPolicy } from "../../server/ice";

describe("ice config", () => {
  it("parses comma-separated ICE server URLs", () => {
    const result = parseIceServers("stun:one.example, turn:two.example");
    expect(result).toEqual([
      { urls: "stun:one.example" },
      { urls: "turn:two.example" }
    ]);
  });

  it("parses JSON arrays with credentials", () => {
    const result = parseIceServers(
      JSON.stringify([
        {
          urls: "turns:relay.example",
          username: "user",
          credential: "secret"
        }
      ])
    );
    expect(result).toEqual([
      {
        urls: "turns:relay.example",
        username: "user",
        credential: "secret"
      }
    ]);
  });

  it("parses a single JSON object", () => {
    const result = parseIceServers(
      JSON.stringify({
        urls: ["stun:one.example", "stun:two.example"]
      })
    );
    expect(result).toEqual([
      { urls: ["stun:one.example", "stun:two.example"] }
    ]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseIceServers("[not-valid-json")).toEqual([]);
  });

  it("defaults ICE transport policy to all", () => {
    expect(parseIceTransportPolicy("all")).toBe("all");
    expect(parseIceTransportPolicy(undefined)).toBe("all");
  });

  it("accepts relay ICE transport policy", () => {
    expect(parseIceTransportPolicy("relay")).toBe("relay");
    expect(parseIceTransportPolicy(" RELAY ")).toBe("relay");
  });
});
