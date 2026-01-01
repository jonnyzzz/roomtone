export type Participant = {
  id: string;
  name: string;
};

export class RoomState {
  private readonly participants = new Map<string, string>();

  add(id: string, name: string): Participant {
    this.participants.set(id, name);
    return { id, name };
  }

  remove(id: string): Participant | undefined {
    const name = this.participants.get(id);
    if (!name) {
      return undefined;
    }
    this.participants.delete(id);
    return { id, name };
  }

  list(): Participant[] {
    return Array.from(this.participants.entries()).map(([id, name]) => ({
      id,
      name
    }));
  }

  count(): number {
    return this.participants.size;
  }
}
