import { spawn } from "node:child_process";
import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const distRoot = path.join(repoRoot, "dist");
const cdpCasesRoot = path.join(repoRoot, "test", "cdp", "cases");
const fixtureRoot = path.join(repoRoot, "test", "uxp-plugin");
const fixtureDistRoot = path.join(fixtureRoot, "dist");
const fixtureGeneratedRoot = path.join(fixtureRoot, "webview", "generated");
const fixtureGeneratedCasesRoot = path.join(fixtureGeneratedRoot, "cases");
const fixtureGeneratedModuleCasesRoot = path.join(fixtureGeneratedRoot, "module-cases");
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
  const bundlePath = path.join(fixtureDistRoot, "uxp-global.js");
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await build({
    entryPoints: [entryFile],
    outfile: bundlePath,
    bundle: true,
    format: "iife",
    globalName: "UxpWebviewBridgeUxp",
    platform: "neutral",
    target: "es2020",
    external: ["fs", "os", "photoshop", "uxp"],
    footer: { js: "window.UxpWebviewBridgeUxp = UxpWebviewBridgeUxp;" },
    logLevel: "silent"
  });
}

async function writeCaseRegistry() {
  await mkdir(fixtureGeneratedCasesRoot, { recursive: true });

  const caseFiles = (await readdirSorted(cdpCasesRoot)).filter((fileName) => fileName.endsWith(".mjs"));
  const registryEntries = caseFiles.map((fileName) => {
    const caseName = fileName.slice(0, -".mjs".length);
    return {
      caseName,
      loader: `() => import(${JSON.stringify(`./cases/${caseName}.mjs`)})`,
      timeoutMs: undefined
    };
  });

  for (const fileName of caseFiles) {
    await cp(path.join(cdpCasesRoot, fileName), path.join(fixtureGeneratedCasesRoot, fileName));
  }

  registryEntries.push(...(await getModuleCaseRegistryEntries()));
  assertUniqueCaseNames(registryEntries.map((entry) => entry.caseName));

  const registrySource = [
    "function selectCase(module, caseName) {",
    "  const testCases = module.default;",
    "  if (!Array.isArray(testCases)) {",
    "    throw new Error(`CDP module case file for ${caseName} must export a default array.`);",
    "  }",
    "  const testCase = testCases.find((candidate) => candidate && candidate.name === caseName);",
    "  if (!testCase || typeof testCase.run !== \"function\") {",
    "    throw new Error(`CDP module case ${caseName} was not found.`);",
    "  }",
    "  return { default: testCase.run };",
    "}",
    "",
    "export const cases = {",
    ...registryEntries.map((entry) => `  ${JSON.stringify(entry.caseName)}: ${entry.loader},`),
    "};",
    "",
    "export const caseTimeouts = {",
    ...registryEntries
      .filter((entry) => entry.timeoutMs !== undefined)
      .map((entry) => `  ${JSON.stringify(entry.caseName)}: ${JSON.stringify(entry.timeoutMs)},`),
    "};",
    ""
  ].join("\n");

  await writeFile(path.join(fixtureGeneratedRoot, "case-registry.js"), registrySource, "utf8");
}

async function getModuleCaseRegistryEntries() {
  await runCdpWebviewTypeScriptBuild();
  await rewriteGeneratedWebviewCaseImports();

  const compiledWebviewRoot = path.join(fixtureGeneratedModuleCasesRoot, "src", "webview");
  const files = await listFiles(compiledWebviewRoot, ".test.js");
  const entries = [];

  for (const file of files) {
    const module = await import(pathToFileURL(file).href);
    const testCases = module.default;
    if (!Array.isArray(testCases)) {
      throw new Error(`CDP module case file ${path.relative(repoRoot, file)} must export a default array.`);
    }

    const importSpecifier = `./${toPosixPath(path.relative(fixtureGeneratedRoot, file))}`;
    for (const testCase of testCases) {
      if (!testCase || typeof testCase.name !== "string") {
        throw new Error(`CDP module case file ${path.relative(repoRoot, file)} contains a case without name.`);
      }
      if (typeof testCase.run !== "function") {
        throw new Error(`CDP module case ${testCase.name} must define a run function.`);
      }

      entries.push({
        caseName: testCase.name,
        loader: `() => import(${JSON.stringify(importSpecifier)}).then((module) => selectCase(module, ${JSON.stringify(testCase.name)}))`,
        timeoutMs: normalizeCaseTimeout(testCase.timeoutMs, testCase.name)
      });
    }
  }

  return entries;
}

function normalizeCaseTimeout(value, caseName) {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`CDP module case ${caseName} timeoutMs must be a positive finite number.`);
  }
  return value;
}

function runCdpWebviewTypeScriptBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsc", "-p", "tsconfig.cdp-webview.json"], {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tsc -p tsconfig.cdp-webview.json failed with code ${code}.`));
    });
  });
}

async function rewriteGeneratedWebviewCaseImports() {
  const helperFile = path.join(fixtureGeneratedModuleCasesRoot, "test", "cdp", "webview-cases.js");
  const files = await listFiles(fixtureGeneratedModuleCasesRoot, ".js");

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const rewritten = source.replaceAll(
      '"@test/cdp/webview-cases.js"',
      JSON.stringify(toRelativeImport(path.dirname(file), helperFile))
    );
    if (rewritten !== source) {
      await writeFile(file, rewritten, "utf8");
    }
  }
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

async function listFiles(root, suffix) {
  const entries = await readdirSortedWithTypes(root);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, suffix)));
    } else if (entry.isFile() && fullPath.endsWith(suffix)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readdirSortedWithTypes(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name)
    );
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function toRelativeImport(fromDirectory, toFile) {
  let relativePath = toPosixPath(path.relative(fromDirectory, toFile));
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

function toPosixPath(value) {
  return value.replaceAll(path.sep, "/");
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
