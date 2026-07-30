import assert from "node:assert/strict";
import { test } from "node:test";

import { startWebviewHarness } from "../uxp-plugin/webview/readiness.js";

test("WebView harness readiness is not blocked by a never-settling bridge handshake", async () => {
  const messages = [];
  let connectStarted = false;

  void startWebviewHarness({
    postReady(message) {
      messages.push(message);
    },
    async connect() {
      connectStarted = true;
      return new Promise(() => undefined);
    }
  });

  await Promise.resolve();
  assert.equal(connectStarted, true);
  assert.deepEqual(messages, [{ phase: "harness-ready" }]);
});

test("WebView harness reports bridge setup failures without retracting harness readiness", async () => {
  const messages = [];

  await startWebviewHarness({
    postReady(message) {
      messages.push(message);
    },
    async connect() {
      const error = new Error("handshake rejected");
      error.code = "ERR_BRIDGE_HANDSHAKE";
      throw error;
    },
    normalizeError(error) {
      return { message: error.message, code: error.code };
    }
  });

  assert.deepEqual(messages, [
    { phase: "harness-ready" },
    {
      phase: "bridge-failed",
      bridgeError: { message: "handshake rejected", code: "ERR_BRIDGE_HANDSHAKE" }
    }
  ]);
});
