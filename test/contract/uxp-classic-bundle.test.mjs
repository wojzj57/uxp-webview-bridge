import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

test("UXP fixture esbuild IIFE bundle parses as a classic script", async () => {
  await execFileAsync("node", ["test/runner/prepare-uxp-fixture.mjs"]);
  await execFileAsync("node", ["--check", "test/uxp-plugin/dist/uxp-global.js"]);
});
