import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distRoot = path.join(repoRoot, "dist");
const cdpCasesRoot = path.join(repoRoot, "test", "cdp", "cases");
const fixtureRoot = path.join(repoRoot, "test", "uxp-plugin");
const fixtureDistRoot = path.join(fixtureRoot, "dist");
const fixtureGeneratedRoot = path.join(fixtureRoot, "webview", "generated");
const fixtureGeneratedCasesRoot = path.join(fixtureGeneratedRoot, "cases");
const oldVendorRoot = path.join(fixtureRoot, "vendor");

assertInsideWorkspace(fixtureDistRoot);
assertInsideWorkspace(fixtureGeneratedRoot);
assertInsideWorkspace(oldVendorRoot);

await rm(oldVendorRoot, { recursive: true, force: true });
await rm(fixtureDistRoot, { recursive: true, force: true });
await rm(fixtureGeneratedRoot, { recursive: true, force: true });
await cp(distRoot, fixtureDistRoot, { recursive: true });
await writeCaseRegistry();
await writeUxpClassicBundle();

console.log(`Prepared UXP fixture dist at ${path.relative(repoRoot, fixtureDistRoot)}`);

function assertInsideWorkspace(targetPath) {
  const relativePath = path.relative(repoRoot, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Refusing to prepare fixture outside workspace: ${targetPath}`);
  }
}

async function writeUxpClassicBundle() {
  const entryFile = path.join(distRoot, "uxp", "index.js");
  const modules = [];
  const visited = new Set();

  await visit(entryFile);

  const bundle = [
    "(function () {",
    '"use strict";',
    ...modules.map((module) => `\n// ${path.relative(distRoot, module.file).replaceAll(path.sep, "/")}\n${module.source}`),
    "\nwindow.UxpWebviewBridgeUxp = { configUxpBridge };",
    "})();",
    ""
  ].join("\n");

  const bundlePath = path.join(fixtureDistRoot, "uxp-global.js");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, bundle, "utf8");

  async function visit(file) {
    const normalizedFile = path.normalize(file);
    if (visited.has(normalizedFile)) {
      return;
    }
    visited.add(normalizedFile);

    const rawSource = await readFile(normalizedFile, "utf8");
    const imports = getRelativeImports(rawSource, normalizedFile);
    for (const importedFile of imports) {
      await visit(importedFile);
    }

    modules.push({
      file: normalizedFile,
      source: toClassicScript(rawSource)
    });
  }
}

function getRelativeImports(source, file) {
  const imports = [];
  const importPattern = /^\s*import\s+[^"']*["']([^"']+)["'];?\s*$/gm;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier.startsWith(".")) {
      imports.push(path.resolve(path.dirname(file), specifier));
    }
  }

  return imports;
}

function toClassicScript(source) {
  return source
    .replace(/^\s*import\s+[^"']*["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function\b|class\b|const\b|let\b|var\b)/g, "")
    .replace(/\/\/# sourceMappingURL=.*$/gm, "");
}

async function writeCaseRegistry() {
  await mkdir(fixtureGeneratedCasesRoot, { recursive: true });

  const caseFiles = (await readdirSorted(cdpCasesRoot)).filter((fileName) => fileName.endsWith(".mjs"));
  const caseNames = caseFiles.map((fileName) => fileName.slice(0, -".mjs".length));

  assertUniqueCaseNames(caseNames);

  for (const fileName of caseFiles) {
    await cp(path.join(cdpCasesRoot, fileName), path.join(fixtureGeneratedCasesRoot, fileName));
  }

  const registrySource = [
    "export const cases = {",
    ...caseNames.map((caseName) => `  ${JSON.stringify(caseName)}: () => import(${JSON.stringify(`./cases/${caseName}.mjs`)}),`),
    "};",
    ""
  ].join("\n");

  await writeFile(path.join(fixtureGeneratedRoot, "case-registry.js"), registrySource, "utf8");
}

async function readdirSorted(directory) {
  try {
    return (await readdir(directory)).sort();
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function assertUniqueCaseNames(caseNames) {
  const seen = new Set();
  for (const caseName of caseNames) {
    if (seen.has(caseName)) {
      throw new Error(`Duplicate CDP case name: ${caseName}`);
    }
    seen.add(caseName);
  }
}
