export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceTransportPolicy = "all" | "relay";

function normalizeIceServer(entry: unknown): IceServerConfig | null {
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed ? { urls: trimmed } : null;
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const urlsRaw = record.urls;
  if (typeof urlsRaw === "string") {
    const trimmed = urlsRaw.trim();
    if (!trimmed) {
      return null;
    }
    return {
      urls: trimmed,
      username: typeof record.username === "string" ? record.username : undefined,
      credential:
        typeof record.credential === "string" ? record.credential : undefined
    };
  }
  if (Array.isArray(urlsRaw)) {
    const urls = urlsRaw
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      return null;
    }
    return {
      urls,
      username: typeof record.username === "string" ? record.username : undefined,
      credential:
        typeof record.credential === "string" ? record.credential : undefined
    };
  }
  return null;
}

export function parseIceServers(raw?: string): IceServerConfig[] {
  if (!raw) {
    return [];
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => normalizeIceServer(entry))
          .filter((entry): entry is IceServerConfig => Boolean(entry));
      }
      const normalized = normalizeIceServer(parsed);
      return normalized ? [normalized] : [];
    } catch {
      return [];
    }
  }

  const urls = trimmed
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return urls.map((url) => ({ urls: url }));
}

export function parseIceTransportPolicy(raw?: string): IceTransportPolicy {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "relay") {
    return "relay";
  }
  return "all";
}
