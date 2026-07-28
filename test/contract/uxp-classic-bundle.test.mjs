import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

test("UXP fixture esbuild IIFE bundle parses as a classic script", async () => {
  await execFileAsync("node", ["test/runner/prepare-uxp-fixture.mjs"]);
  await execFileAsync("node", ["--check", "test/uxp-plugin/dist/uxp-global.js"]);
  const registry = await readFile("test/uxp-plugin/webview/generated/case-registry.js", "utf8");
  assert.match(registry, /export const caseTimeouts =/);
  assert.match(registry, /"photoshop\.layer-filter-methods": 180000/);
});
