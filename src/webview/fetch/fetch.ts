import {
  FETCH_MODULE_ID,
  isFetchRedirectMode,
  type FetchHeaderTuple,
  type FetchRedirectMode,
  type FetchRequestTransport,
  type FetchResponseTransport
} from "@shared/uxp-api/fetch-protocol.js";
import {
  fsBytesToTransport,
  fsTransportToUint8Array,
  type FsTransportData
} from "@shared/uxp-api/fs-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type { FetchNamespace } from "./types.js";

interface FetchRpc {
  callCancelable<T>(
    module: string,
    method: string,
    args?: readonly unknown[]
  ): { readonly operationId: string; readonly promise: Promise<T> };
  cancel(operationId: string): void;
}

export function createFetchNamespace(rpc: FetchRpc): FetchNamespace {
  return async function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = await serializeRequest(input, init);
    const signal = init?.signal ?? undefined;

    if (signal?.aborted) {
      throw toAbortError(signal.reason);
    }

    const { operationId, promise } = rpc.callCancelable<FetchResponseTransport>(
      FETCH_MODULE_ID,
      "fetch",
      [request]
    );

    let aborted = false;
    const onAbort = (): void => {
      aborted = true;
      rpc.cancel(operationId);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const response = await promise;
      return deserializeResponse(response);
    } catch (error) {
      if (aborted || signal?.aborted) {
        throw toAbortError(signal?.reason);
      }
      throw toFetchTypeError(error);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

export const fetch: FetchNamespace = createFetchNamespace({
  callCancelable: (module, method, args) => getBridgeRpcClient().callCancelable(module, method, args),
  cancel: (operationId) => getBridgeRpcClient().cancel(operationId)
});

async function serializeRequest(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<FetchRequestTransport> {
  const { url, baseMethod, baseHeaders, baseBody } = resolveInput(input);

  const method = (init?.method ?? baseMethod ?? "GET").toUpperCase();
  const headers = new Headers(baseHeaders);
  applyHeaders(headers, init?.headers);

  const bodySource = init && "body" in init ? init.body : baseBody;
  const body = await normalizeBody(bodySource, headers);

  const redirect = resolveRedirect(init?.redirect);

  const transport: {
    url: string;
    method: string;
    headers: FetchHeaderTuple[];
    body?: FsTransportData;
    redirect?: FetchRedirectMode;
  } = {
    url,
    method,
    headers: headerTuples(headers)
  };
  if (body !== undefined) {
    transport.body = body;
  }
  if (redirect !== undefined) {
    transport.redirect = redirect;
  }
  return transport;
}

function resolveInput(input: RequestInfo | URL): {
  url: string;
  baseMethod?: string;
  baseHeaders?: Headers;
  baseBody?: BodyInit | null;
} {
  if (typeof input === "string") {
    return { url: input };
  }
  if (input instanceof URL) {
    return { url: input.toString() };
  }
  // Request
  return {
    url: input.url,
    baseMethod: input.method,
    baseHeaders: input.headers
  };
}

function applyHeaders(target: Headers, source: HeadersInit | undefined): void {
  if (source === undefined) {
    return;
  }
  const overrides = new Headers(source);
  overrides.forEach((value, key) => {
    target.set(key, value);
  });
}

async function normalizeBody(
  body: BodyInit | null | undefined,
  headers: Headers
): Promise<FsTransportData | undefined> {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === "string") {
    return { kind: "text", value: body };
  }

  if (isReadableStream(body)) {
    throw new TypeError("Forwarded fetch does not support ReadableStream request bodies.");
  }

  // Blob, ArrayBuffer, ArrayBufferView, FormData, URLSearchParams: let the DOM
  // serialize the body to bytes and compute the correct Content-Type (including
  // the generated multipart boundary for FormData).
  const encoded = new Response(body);
  const contentType = encoded.headers.get("content-type");
  if (contentType && !headers.has("content-type")) {
    headers.set("content-type", contentType);
  }
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  return fsBytesToTransport(bytes);
}

function resolveRedirect(redirect: RequestRedirect | undefined): FetchRedirectMode | undefined {
  if (redirect === undefined) {
    return undefined;
  }
  return isFetchRedirectMode(redirect) ? redirect : undefined;
}

function headerTuples(headers: Headers): FetchHeaderTuple[] {
  const tuples: FetchHeaderTuple[] = [];
  headers.forEach((value, key) => {
    tuples.push([key, value]);
  });
  return tuples;
}

function deserializeResponse(transport: FetchResponseTransport): Response {
  const bytes = transportToBytes(transport.body);
  const body = bytes.byteLength === 0 ? null : toArrayBuffer(bytes);
  return new Response(body, {
    status: transport.status,
    statusText: transport.statusText,
    headers: transport.headers.map((tuple) => [tuple[0], tuple[1]])
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function transportToBytes(body: FsTransportData): Uint8Array {
  if (body.kind === "text") {
    return new TextEncoder().encode(body.value);
  }
  return fsTransportToUint8Array(body);
}

function isReadableStream(value: unknown): value is ReadableStream {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function toAbortError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  return new DOMException("The operation was aborted.", "AbortError");
}

function toFetchTypeError(error: unknown): TypeError {
  const message = error instanceof Error ? error.message : String(error);
  const typeError = new TypeError(`Failed to fetch: ${message}`);
  (typeError as { cause?: unknown }).cause = error;
  return typeError;
}
