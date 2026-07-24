import {
  assertFetchProtocolMethodName,
  FETCH_MODULE_ID,
  isFetchRedirectMode,
  type FetchHeaderTuple,
  type FetchRequestTransport,
  type FetchResponseTransport
} from "@shared/uxp-api/fetch-protocol.js";
import {
  fsBytesToTransport,
  fsTransportToHostValue,
  isFsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import type { UxpDispatchContext, UxpModuleAdapter } from "@uxp/module-registry.js";

export const fetchModuleAdapter: UxpModuleAdapter = {
  moduleId: FETCH_MODULE_ID,
  dispatch: dispatchFetchCall
};

export async function dispatchFetchCall(
  method: string,
  args: readonly unknown[],
  context?: UxpDispatchContext
): Promise<FetchResponseTransport> {
  assertFetchProtocolMethodName(method);

  if (args.length !== 1) {
    throw new Error("fetch.fetch expects a single request argument.");
  }

  const request = parseRequestTransport(args[0]);
  return performFetch(request, context?.signal);
}

async function performFetch(
  request: FetchRequestTransport,
  signal: AbortSignal | undefined
): Promise<FetchResponseTransport> {
  const init: RequestInit = {
    method: request.method,
    headers: request.headers.map((tuple) => [tuple[0], tuple[1]])
  };

  if (request.body !== undefined) {
    init.body = fsTransportToHostValue(request.body);
  }
  if (request.redirect !== undefined) {
    init.redirect = request.redirect;
  }
  if (signal !== undefined) {
    init.signal = signal;
  }

  const response = await fetch(request.url, init);
  const bytes = new Uint8Array(await response.arrayBuffer());

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaderTuples(response.headers),
    body: fsBytesToTransport(bytes)
  };
}

function responseHeaderTuples(headers: Headers): FetchHeaderTuple[] {
  const tuples: FetchHeaderTuple[] = [];
  headers.forEach((value, key) => {
    tuples.push([key, value]);
  });
  return tuples;
}

function parseRequestTransport(value: unknown): FetchRequestTransport {
  if (!isRecord(value)) {
    throw new Error("fetch request must be an object.");
  }

  const { url, method, headers, body, redirect } = value;

  if (typeof url !== "string" || url.length === 0) {
    throw new Error("fetch request url must be a non-empty string.");
  }
  if (typeof method !== "string" || method.length === 0) {
    throw new Error("fetch request method must be a non-empty string.");
  }
  if (!isHeaderTupleArray(headers)) {
    throw new Error("fetch request headers must be an array of [name, value] tuples.");
  }
  if (body !== undefined && !isFsTransportData(body)) {
    throw new Error("fetch request body must be string or binary transport data when provided.");
  }
  if (redirect !== undefined && !isFetchRedirectMode(redirect)) {
    throw new Error("fetch request redirect must be 'follow', 'error', or 'manual' when provided.");
  }

  return {
    url,
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
    ...(redirect !== undefined ? { redirect } : {})
  };
}

function isHeaderTupleArray(value: unknown): value is readonly FetchHeaderTuple[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === "string" &&
        typeof entry[1] === "string"
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
