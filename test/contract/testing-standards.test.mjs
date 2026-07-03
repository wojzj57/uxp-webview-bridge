import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { test } from "node:test";

test("CDP case files are immediate .mjs files with stable case names", async () => {
  const caseFiles = (await readdir("test/cdp/cases")).filter((fileName) => fileName.endsWith(".mjs"));

  assert.deepEqual(caseFiles.sort(), [
    "bridge.config-connects.mjs",
    "bridge.ping.mjs",
    "bridge.public-api-loads.mjs",
    "bridge.remote-error-shape.mjs",
    "fs.plugin-data-roundtrip.mjs",
    "os.platform.mjs",
    "path.local.mjs",
    "uxp.host-info.mjs",
    "uxp.plugin-manager-gated.mjs"
  ]);
});
