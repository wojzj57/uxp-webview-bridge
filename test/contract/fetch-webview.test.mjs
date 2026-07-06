import assert from "node:assert/strict";
import { test } from "node:test";

function okResponseTransport(bodyText = "ok") {
  return {
    status: 200,
    statusText: "OK",
    headers: [["content-type", "text/plain"]],
    body: { kind: "text", value: bodyText }
  };
}

function stubRpc(handler) {
  return {
    callCancelable(module, method, args) {
      return { operationId: "op-test", promise: handler(module, method, args) };
    },
    cancel() {}
  };
}

test("WebView public API exposes fetch and installFetch", async () => {
  const mod = await import("../../dist/webview/index.js");
  assert.equal(typeof mod.fetch, "function");
  assert.equal(typeof mod.installFetch, "function");
});

test("WebView fetch serializes a string URL and text body", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  let request;
  const fetch = createFetchNamespace(
    stubRpc((module, method, args) => {
      assert.equal(module, "uxp-api/modules/fetch");
      assert.equal(method, "fetch");
      request = args[0];
      return Promise.resolve(okResponseTransport());
    })
  );

  await fetch("https://example.com/api", { method: "post", body: "payload" });

  assert.equal(request.url, "https://example.com/api");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, { kind: "text", value: "payload" });
});

test("WebView fetch encodes URLSearchParams with a generated content-type", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  let request;
  const fetch = createFetchNamespace(
    stubRpc((_m, _method, args) => {
      request = args[0];
      return Promise.resolve(okResponseTransport());
    })
  );

  await fetch("https://example.com", {
    method: "POST",
    body: new URLSearchParams({ a: "1", b: "2" })
  });

  const headerMap = new Map(request.headers);
  assert.match(headerMap.get("content-type") ?? "", /application\/x-www-form-urlencoded/);
  assert.equal(request.body.kind, "bytes");
});

test("WebView fetch encodes FormData as multipart with boundary", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  let request;
  const fetch = createFetchNamespace(
    stubRpc((_m, _method, args) => {
      request = args[0];
      return Promise.resolve(okResponseTransport());
    })
  );

  const form = new FormData();
  form.append("field", "value");

  await fetch("https://example.com", { method: "POST", body: form });

  const headerMap = new Map(request.headers);
  assert.match(headerMap.get("content-type") ?? "", /multipart\/form-data; boundary=/);
  assert.equal(request.body.kind, "bytes");
});

test("WebView fetch rejects ReadableStream bodies", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  const fetch = createFetchNamespace(stubRpc(() => Promise.resolve(okResponseTransport())));

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    }
  });

  await assert.rejects(
    fetch("https://example.com", { method: "POST", body: stream }),
    /does not support ReadableStream/
  );
});

test("WebView fetch reconstructs a real Response from transport", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  const fetch = createFetchNamespace(
    stubRpc(() =>
      Promise.resolve({
        status: 404,
        statusText: "Not Found",
        headers: [["content-type", "application/json"]],
        body: { kind: "text", value: '{"error":"missing"}' }
      })
    )
  );

  const response = await fetch("https://example.com/missing");

  assert.equal(response.status, 404);
  assert.equal(response.ok, false);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { error: "missing" });
});

test("WebView fetch maps transport failures to TypeError with cause", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  const remoteError = new Error("connection refused");
  const fetch = createFetchNamespace(stubRpc(() => Promise.reject(remoteError)));

  await assert.rejects(fetch("https://example.com"), (error) => {
    assert.ok(error instanceof TypeError, "must be a TypeError");
    assert.equal(error.cause, remoteError);
    return true;
  });
});

test("WebView fetch rejects immediately when the signal is already aborted", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  let dispatched = false;
  const fetch = createFetchNamespace(
    stubRpc(() => {
      dispatched = true;
      return Promise.resolve(okResponseTransport());
    })
  );

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(fetch("https://example.com", { signal: controller.signal }));
  assert.equal(dispatched, false, "must not dispatch when pre-aborted");
});

test("WebView fetch cancels the operation and rejects on in-flight abort", async () => {
  const { createFetchNamespace } = await import("../../dist/webview/uxp-api/modules/fetch/index.js");
  const controller = new AbortController();
  let cancelledOperationId;
  let rejectPromise;

  const rpc = {
    callCancelable() {
      return {
        operationId: "op-abort",
        promise: new Promise((_resolve, reject) => {
          rejectPromise = reject;
        })
      };
    },
    cancel(operationId) {
      cancelledOperationId = operationId;
      rejectPromise(new Error("cancelled by host"));
    }
  };

  const fetch = createFetchNamespace(rpc);
  const pending = fetch("https://example.com", { signal: controller.signal });

  // Abort only after the request has been dispatched and the abort listener is
  // attached (serializeRequest is async, so wait a macrotask to be safe).
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();

  await assert.rejects(pending);
  assert.equal(cancelledOperationId, "op-abort");
});
