import fs from "fs";
import path from "path";
import { BotConfig } from "./config";
import { TelegramChat, TelegramUser } from "./telegram";

type AccessState = {
  version: 1;
  allowedUsers: number[];
  allowedChats?: number[];
  adminUsers: number[];
  adminUsernames: string[];
  updatedAt: string;
};

export class AccessStore {
  private allowedUsers: Set<number>;
  private allowedChats: Set<number> | null;
  private adminUsers: Set<number>;
  private adminUsernames: Set<string>;

  constructor(private readonly stateFile: string, state: AccessState) {
    this.allowedUsers = new Set(state.allowedUsers);
    this.allowedChats = state.allowedChats
      ? new Set(state.allowedChats)
      : null;
    this.adminUsers = new Set(state.adminUsers);
    this.adminUsernames = new Set(
      state.adminUsernames.map((name) => name.toLowerCase())
    );
  }

  static load(config: BotConfig): AccessStore {
    const stateFile = config.stateFile;
    const initialState = buildInitialState(config);

    let state = initialState;
    if (fs.existsSync(stateFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8")) as Partial<
          AccessState
        >;
        state = normalizeState(parsed, initialState);
      } catch (error) {
        console.warn("Failed to parse bot state file, recreating:", error);
        state = initialState;
      }
    } else {
      ensureDir(stateFile);
    }

    state.adminUsers = mergeNumbers(state.adminUsers, initialState.adminUsers);
    state.adminUsernames = mergeStrings(
      state.adminUsernames,
      initialState.adminUsernames
    );

    const store = new AccessStore(stateFile, state);
    store.persist();
    return store;
  }

  isAdmin(user: TelegramUser): boolean {
    if (this.adminUsers.has(user.id)) {
      return true;
    }
    const username = user.username?.toLowerCase();
    return username ? this.adminUsernames.has(username) : false;
  }

  isAllowedUser(user: TelegramUser): boolean {
    return this.allowedUsers.has(user.id) || this.isAdmin(user);
  }

  isChatAllowed(chat: TelegramChat): boolean {
    if (!this.allowedChats || this.allowedChats.size === 0) {
      return true;
    }
    if (chat.type === "private") {
      return true;
    }
    return this.allowedChats.has(chat.id);
  }

  allowUser(id: number): void {
    this.allowedUsers.add(id);
    this.persist();
  }

  denyUser(id: number): void {
    this.allowedUsers.delete(id);
    this.persist();
  }

  allowChat(id: number): void {
    if (!this.allowedChats) {
      this.allowedChats = new Set<number>();
    }
    this.allowedChats.add(id);
    this.persist();
  }

  denyChat(id: number): void {
    if (!this.allowedChats) {
      return;
    }
    this.allowedChats.delete(id);
    if (this.allowedChats.size === 0) {
      this.allowedChats = null;
    }
    this.persist();
  }

  summary(): string {
    const allowedUsers = formatNumbers(this.allowedUsers);
    const allowedChats = this.allowedChats
      ? formatNumbers(this.allowedChats)
      : "any";
    const adminUsers = formatNumbers(this.adminUsers);
    const adminUsernames =
      this.adminUsernames.size > 0
        ? Array.from(this.adminUsernames).join(", ")
        : "none";

    return [
      `Allowed users: ${allowedUsers}`,
      `Allowed chats: ${allowedChats}`,
      `Admin users: ${adminUsers}`,
      `Admin usernames: ${adminUsernames}`
    ].join("\n");
  }

  private persist(): void {
    const state: AccessState = {
      version: 1,
      allowedUsers: Array.from(this.allowedUsers),
      allowedChats: this.allowedChats ? Array.from(this.allowedChats) : undefined,
      adminUsers: Array.from(this.adminUsers),
      adminUsernames: Array.from(this.adminUsernames),
      updatedAt: new Date().toISOString()
    };
    ensureDir(this.stateFile);
    fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}

function buildInitialState(config: BotConfig): AccessState {
  return {
    version: 1,
    allowedUsers: Array.from(config.allowedUsers),
    allowedChats: config.allowedChats ? Array.from(config.allowedChats) : undefined,
    adminUsers: Array.from(config.adminUsers),
    adminUsernames: Array.from(config.adminUsernames),
    updatedAt: new Date().toISOString()
  };
}

function normalizeState(
  parsed: Partial<AccessState>,
  fallback: AccessState
): AccessState {
  return {
    version: 1,
    allowedUsers: Array.isArray(parsed.allowedUsers)
      ? parsed.allowedUsers.filter(isNumber)
      : fallback.allowedUsers,
    allowedChats: Array.isArray(parsed.allowedChats)
      ? parsed.allowedChats.filter(isNumber)
      : fallback.allowedChats,
    adminUsers: Array.isArray(parsed.adminUsers)
      ? parsed.adminUsers.filter(isNumber)
      : fallback.adminUsers,
    adminUsernames: Array.isArray(parsed.adminUsernames)
      ? parsed.adminUsernames.filter(isString)
      : fallback.adminUsernames,
    updatedAt: new Date().toISOString()
  };
}

function mergeNumbers(left: number[], right: number[]): number[] {
  return Array.from(new Set([...left, ...right]));
}

function mergeStrings(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right].map((value) => value.toLowerCase())));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function formatNumbers(values: Set<number>): string {
  return values.size > 0 ? Array.from(values).join(", ") : "none";
}
