import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("CDP cases keep bridge cases separate from colocated WebView module cases", async () => {
  const immediateCaseFiles = (await readdir("test/cdp/cases", { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .map((entry) => entry.name)
    .sort();
  const nestedCaseDirectories = (await readdir("test/cdp/cases", { withFileTypes: true })).filter((entry) =>
    entry.isDirectory()
  );

  assert.ok(immediateCaseFiles.length > 0, "test/cdp/cases should keep bridge-level CDP cases.");
  assert.deepEqual(nestedCaseDirectories, [], "test/cdp/cases should not contain nested case directories.");

  const moduleCasePrefixes = ["fs.", "os.", "path.", "photoshop.", "uxp."];
  for (const fileName of immediateCaseFiles) {
    const caseName = fileName.slice(0, -".mjs".length);
    assert.equal(
      moduleCasePrefixes.some((prefix) => caseName.startsWith(prefix)),
      false,
      `${fileName} should be colocated with its WebView module instead of living in test/cdp/cases.`
    );
  }
});

test("colocated WebView CDP cases use module-prefixed unique case names", async () => {
  const files = await listFiles("src/webview", ".test.ts");
  assert.ok(files.length > 0, "expected colocated WebView CDP cases under src/webview.");

  const seen = new Set();
  for (const file of files) {
    const prefix = getWebviewCasePrefix(file);
    assert.ok(prefix, `${file} should be under a supported WebView module test directory.`);

    const source = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
    const caseNames = [...source.matchAll(/\bname\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
    assert.ok(caseNames.length > 0, `${file} should define at least one named CDP case.`);

    for (const caseName of caseNames) {
      assert.ok(caseName.startsWith(`${prefix}.`), `${caseName} should start with ${prefix}.`);
      assert.equal(seen.has(caseName), false, `Duplicate CDP case name: ${caseName}`);
      seen.add(caseName);
    }
  }
});

async function listFiles(root, suffix) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, suffix)));
    } else if (entry.isFile() && fullPath.endsWith(suffix)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function getWebviewCasePrefix(file) {
  const parts = path.relative("src/webview", file).split(path.sep);

  if (parts[0] === "uxp-api" && parts[1] === "modules" && parts[2]) {
    return parts[2];
  }

  if (parts[0] === "uxp-api" && parts[1] === "global-members" && parts[2]) {
    return parts[2];
  }

  if (parts[0] === "photoshop-api" && parts[1] === "modules" && parts[2]) {
    return parts[2] === "photoshop" ? "photoshop" : `photoshop.${parts[2]}`;
  }

  return undefined;
}
