import { describe, expect, it } from "vitest";
import { RoomState } from "../../server/room";

describe("RoomState", () => {
  it("adds and removes participants", () => {
    const room = new RoomState();
    const alice = room.add("a1", "Alice");
    const bob = room.add("b2", "Bob");

    expect(room.count()).toBe(2);
    expect(room.list()).toEqual([alice, bob]);

    const removed = room.remove("a1");
    expect(removed).toEqual(alice);
    expect(room.count()).toBe(1);
    expect(room.list()).toEqual([bob]);
  });

  it("returns undefined for missing participants", () => {
    const room = new RoomState();
    expect(room.remove("missing")).toBeUndefined();
  });
});
