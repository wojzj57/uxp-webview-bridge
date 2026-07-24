import assert from "node:assert/strict";
import { test } from "node:test";

import { formatCdpResult } from "../runner/cdp-reporter.mjs";

test("CDP reporter formats compact suite results without protocol noise", () => {
  const output = formatCdpResult(
    {
      suiteName: "all",
      status: "failed",
      durationMs: 42,
      cases: [
        {
          type: "uxp-webview-bridge:test-result",
          id: "case-1",
          caseName: "bridge.ping",
          status: "passed",
          durationMs: 2,
          result: { ok: true, hasUxpHost: true }
        },
        {
          type: "uxp-webview-bridge:test-result",
          id: "case-2",
          caseName: "bridge.remote-error-shape",
          status: "failed",
          durationMs: 5,
          error: {
            remoteName: "Error",
            remoteMessage: "uxp shell capability is disabled"
          }
        }
      ]
    },
    { color: "never" }
  );

  assert.match(output, /CDP suite: all  \[FAIL\]/);
  assert.match(output, /Cases: 1 passed, 1 failed, 0 skipped/);
  assert.match(output, /\[PASS\]\s+bridge\.ping\s+ok=true, hasUxpHost=true/);
  assert.match(output, /\[FAIL\]\s+bridge\.remote-error-shape\s+Error: uxp shell capability is disabled/);
  assert.match(output, /Failures/);
  assert.match(output, /error: \{/);
  assert.doesNotMatch(output, /uxp-webview-bridge:test-result/);
  assert.doesNotMatch(output, /\bcase-1\b/);
  assert.doesNotMatch(output, /\bdurationMs\b/);
  assert.doesNotMatch(output, /"ok": true/);
});

test("CDP reporter formats verbose suite results with full case payloads", () => {
  const output = formatCdpResult(
    {
      suiteName: "all",
      status: "passed",
      cases: [
        {
          caseName: "bridge.ping",
          status: "passed",
          result: { ok: true }
        }
      ]
    },
    { color: "never", detail: "verbose" }
  );

  assert.match(output, /CDP suite all: \[PASS\]/);
  assert.match(output, /result: \{/);
  assert.match(output, /"ok": true/);
});

test("CDP reporter can force ANSI colors", () => {
  const output = formatCdpResult(
    {
      caseName: "os.platform",
      status: "passed",
      result: { platform: "win32" }
    },
    { color: "always" }
  );

  assert.match(output, /\x1b\[32m\[PASS\]\x1b\[0m\s+os\.platform/);
});
