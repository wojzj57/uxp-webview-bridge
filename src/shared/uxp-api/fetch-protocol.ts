import type { FsTransportData } from "./fs-protocol.js";
// fetch bodies reuse fs's text|bytes union verbatim; the binary half of that
// union is the shared envelope (ADR 0011).

export const FETCH_MODULE_ID = "uxp-api/modules/fetch";

export const FETCH_METHOD_NAMES = ["fetch"] as const;

export type FetchProtocolMethodName = (typeof FETCH_METHOD_NAMES)[number];

export type FetchHeaderTuple = readonly [name: string, value: string];

export type FetchRedirectMode = "follow" | "error" | "manual";

/**
 * A fetch request serialized for transport. The WebView normalizes every
 * accepted `input`/`init.body` shape into either text or binary transport data
 * before crossing the bridge, so the UXP host only ever sees these shapes.
 */
export interface FetchRequestTransport {
  readonly url: string;
  readonly method: string;
  readonly headers: readonly FetchHeaderTuple[];
  readonly body?: FsTransportData;
  readonly redirect?: FetchRedirectMode;
}

/**
 * A fetch response serialized for transport. The UXP host eagerly reads the
 * entire response body into bytes (no streaming) and returns it alongside the
 * status line and headers so the WebView can reconstruct a native `Response`.
 */
export interface FetchResponseTransport {
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly FetchHeaderTuple[];
  readonly body: FsTransportData;
}

const FETCH_METHOD_SET = new Set<string>(FETCH_METHOD_NAMES);

export function isFetchProtocolMethodName(method: string): method is FetchProtocolMethodName {
  return FETCH_METHOD_SET.has(method);
}

export function assertFetchProtocolMethodName(
  method: string
): asserts method is FetchProtocolMethodName {
  if (!isFetchProtocolMethodName(method)) {
    throw new Error(`Unsupported fetch method: ${method}`);
  }
}

export function isFetchRedirectMode(value: unknown): value is FetchRedirectMode {
  return value === "follow" || value === "error" || value === "manual";
}
