import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);

test("UXP fixture classic bundle parses after concatenating UXP-side modules", async () => {
  await execFileAsync("node", ["test/runner/prepare-uxp-fixture.mjs"]);
  await execFileAsync("node", ["--check", "test/uxp-plugin/dist/uxp-global.js"]);
});
