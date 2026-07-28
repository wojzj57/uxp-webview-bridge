export const DEFAULT_ALLOWED_ORIGINS = [
  "plugin:",
  "plugin-data:",
  "plugin-temp:",
  "http://localhost",
  "https://localhost",
  "http://127.0.0.1",
  "https://127.0.0.1"
] as const;

const LOOPBACK_ORIGINS = new Set<string>(DEFAULT_ALLOWED_ORIGINS.slice(3));

export function mergeAllowedOrigins(
  additionalOrigins: readonly string[] | undefined
): readonly string[] {
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...(additionalOrigins ?? [])])];
}

export function isAllowedOrigin(origin: string, allowedOrigins: readonly string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.endsWith(":")) {
      return origin.startsWith(allowedOrigin);
    }
    if (LOOPBACK_ORIGINS.has(allowedOrigin)) {
      return origin === allowedOrigin || hasValidPort(origin, allowedOrigin);
    }
    return origin === allowedOrigin;
  });
}

function hasValidPort(origin: string, originWithoutPort: string): boolean {
  const prefix = `${originWithoutPort}:`;
  if (!origin.startsWith(prefix)) {
    return false;
  }
  const port = origin.slice(prefix.length);
  if (!/^(?:0|[1-9]\d*)$/.test(port)) {
    return false;
  }
  return Number(port) <= 65_535;
}
