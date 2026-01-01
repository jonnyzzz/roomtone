export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type RuntimeConfig = {
  iceServers: IceServer[];
  publicHost?: string;
};

export function normalizeHost(hostHeader?: string): string | undefined {
  if (!hostHeader) {
    return undefined;
  }

  const first = hostHeader.split(",")[0]?.trim();
  if (!first) {
    return undefined;
  }

  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    if (end > 1) {
      return first.slice(1, end);
    }
  }

  return first.split(":")[0];
}

export function buildIceServers(
  env: NodeJS.ProcessEnv,
  hostHeader?: string
): RuntimeConfig {
  const explicitIceServers = env.ICE_SERVERS_JSON?.trim();
  if (explicitIceServers) {
    try {
      const parsed = JSON.parse(explicitIceServers) as IceServer[];
      return { iceServers: parsed, publicHost: normalizeHost(hostHeader) };
    } catch {
      return { iceServers: [], publicHost: normalizeHost(hostHeader) };
    }
  }

  const publicHost = normalizeHost(env.PUBLIC_HOST) ?? normalizeHost(hostHeader);
  const turnHost = normalizeHost(env.TURN_HOST) ?? publicHost;
  const turnUsername = env.TURN_USERNAME ?? "telephony";
  const turnPassword = env.TURN_PASSWORD ?? "telephony";
  const turnPort = env.TURN_PORT ?? "3478";
  const turnTlsPort = env.TURN_TLS_PORT ?? "5349";

  if (!turnHost) {
    return { iceServers: [], publicHost };
  }

  const iceServers: IceServer[] = [
    {
      urls: [
        `turn:${turnHost}:${turnPort}?transport=udp`,
        `turn:${turnHost}:${turnPort}?transport=tcp`
      ],
      username: turnUsername,
      credential: turnPassword
    }
  ];

  if (turnTlsPort) {
    iceServers.push({
      urls: `turns:${turnHost}:${turnTlsPort}`,
      username: turnUsername,
      credential: turnPassword
    });
  }

  return { iceServers, publicHost };
}
