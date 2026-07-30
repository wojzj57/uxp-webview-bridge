import assert from "node:assert/strict";
import { test } from "node:test";

function textTransport(value) {
  return { kind: "text", value };
}

function decodeTransportBody(body) {
  const bytes =
    body.encoding === "array"
      ? Uint8Array.from(body.value)
      : Uint8Array.from(Buffer.from(body.value, "base64"));
  return new TextDecoder().decode(bytes);
}

test("UXP fetch adapter rejects unsupported methods", async () => {
  const { dispatchFetchCall } = await import("../../dist/uxp/uxp-api/modules/fetch/index.js");
  await assert.rejects(
    dispatchFetchCall("notARealMethod", [{}]),
    /Unsupported fetch method: notARealMethod/
  );
});

test("UXP fetch adapter rejects a missing request argument", async () => {
  const { dispatchFetchCall } = await import("../../dist/uxp/uxp-api/modules/fetch/index.js");
  await assert.rejects(dispatchFetchCall("fetch", []), /expects a single request argument/);
});

test("UXP fetch adapter rejects a malformed request", async () => {
  const { dispatchFetchCall } = await import("../../dist/uxp/uxp-api/modules/fetch/index.js");
  await assert.rejects(
    dispatchFetchCall("fetch", [{ url: "", method: "GET", headers: [] }]),
    /url must be a non-empty string/
  );
});

test("UXP fetch adapter forwards the request to the global fetch and serializes the response", async () => {
  const { dispatchFetchCall } = await import("../../dist/uxp/uxp-api/modules/fetch/index.js");
  const originalFetch = globalThis.fetch;
  const observed = {};

  globalThis.fetch = async (url, init) => {
    observed.url = url;
    observed.init = init;
    return new Response("pong", {
      status: 201,
      statusText: "Created",
      headers: { "content-type": "text/plain", "x-test": "1" }
    });
  };

  try {
    const result = await dispatchFetchCall("fetch", [
      {
        url: "https://example.com/api",
        method: "POST",
        headers: [["x-auth", "token"]],
        body: textTransport("hello")
      }
    ]);

    assert.equal(observed.url, "https://example.com/api");
    assert.equal(observed.init.method, "POST");
    assert.equal(observed.init.body, "hello");
    assert.equal(result.status, 201);
    assert.equal(result.statusText, "Created");
    const headerMap = new Map(result.headers);
    assert.equal(headerMap.get("x-test"), "1");
    // The host always reads the response body via arrayBuffer() and serializes
    // it as binary transport data, never as text.
    assert.equal(result.body.kind, "bytes");
    assert.equal(decodeTransportBody(result.body), "pong");
  } finally {
    restoreFetch(originalFetch);
  }
});

test("UXP fetch adapter passes the abort signal to the global fetch", async () => {
  const { dispatchFetchCall } = await import("../../dist/uxp/uxp-api/modules/fetch/index.js");
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();

  globalThis.fetch = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });

  try {
    const pending = dispatchFetchCall(
      "fetch",
      [{ url: "https://example.com", method: "GET", headers: [] }],
      { signal: controller.signal }
    );
    controller.abort();
    await assert.rejects(pending, /aborted/);
  } finally {
    restoreFetch(originalFetch);
  }
});

function restoreFetch(original) {
  if (original === undefined) {
    delete globalThis.fetch;
  } else {
    globalThis.fetch = original;
  }
}
