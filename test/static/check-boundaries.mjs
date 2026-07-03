import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const srcRoot = path.join(repoRoot, "src");
const webviewRoot = path.join(srcRoot, "webview");
const uxpRoot = path.join(srcRoot, "uxp");
const failures = [];

await checkRuntimeBoundaryImports({
  fromRoot: webviewRoot,
  forbiddenRoot: uxpRoot,
  label: "src/webview must not import from src/uxp"
});

await checkRuntimeBoundaryImports({
  fromRoot: uxpRoot,
  forbiddenRoot: webviewRoot,
  label: "src/uxp must not import from src/webview"
});

await checkWebviewEntrypoint();
await checkUxpEntrypoint();
await checkDeprecatedSetupApis();
await checkSymmetricModuleDirectories("uxp-api");
await checkSymmetricModuleDirectories("photoshop-api");

if (failures.length > 0) {
  console.error("Static boundary checks failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Static boundary checks passed.");

async function checkRuntimeBoundaryImports({ fromRoot, forbiddenRoot, label }) {
  for (const file of await listFiles(fromRoot, ".ts")) {
    const source = await readFile(file, "utf8");
    for (const specifier of getImportSpecifiers(source)) {
      if (!specifier.startsWith(".")) {
        continue;
      }

      const resolved = path.resolve(path.dirname(file), specifier);
      if (isPathInside(resolved, forbiddenRoot)) {
        failures.push(`${label}: ${relative(file)} imports ${specifier}`);
      }
    }
  }
}

async function checkWebviewEntrypoint() {
  const file = path.join(webviewRoot, "index.ts");
  const source = await readFile(file, "utf8");
  for (const exportedName of ["configWebviewBridge", "os", "fs", "path", "uxp", "photoshop"]) {
    if (!hasNamedExport(source, exportedName)) {
      failures.push(`src/webview/index.ts must export ${exportedName}`);
    }
  }
}

async function checkUxpEntrypoint() {
  const file = path.join(uxpRoot, "index.ts");
  const source = await readFile(file, "utf8");
  if (!hasNamedExport(source, "configUxpBridge")) {
    failures.push("src/uxp/index.ts must export configUxpBridge");
  }
}

async function checkDeprecatedSetupApis() {
  const deprecatedNames = [
    "createPhotoshopClient",
    "createBridgeClient",
    "createPhotoshopHost",
    "createBridgeHost",
    "configureBridgeClient"
  ];

  for (const file of await listFiles(srcRoot, ".ts")) {
    const source = await readFile(file, "utf8");
    for (const deprecatedName of deprecatedNames) {
      if (new RegExp(`\\b${deprecatedName}\\b`).test(source)) {
        failures.push(`${relative(file)} reintroduces deprecated setup API ${deprecatedName}`);
      }
    }
  }
}

async function checkSymmetricModuleDirectories(apiName) {
  const webviewModulesRoot = path.join(webviewRoot, apiName, "modules");
  const uxpModulesRoot = path.join(uxpRoot, apiName, "modules");

  if (!existsSync(webviewModulesRoot) && !existsSync(uxpModulesRoot)) {
    return;
  }

  const webviewModules = await listImmediateDirectories(webviewModulesRoot);
  const uxpModules = await listImmediateDirectories(uxpModulesRoot);

  for (const moduleName of difference(webviewModules, uxpModules)) {
    failures.push(`missing UXP module directory for ${apiName}/${moduleName}`);
  }

  for (const moduleName of difference(uxpModules, webviewModules)) {
    failures.push(`missing WebView module directory for ${apiName}/${moduleName}`);
  }
}

async function listFiles(root, extension) {
  if (!existsSync(root)) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, extension)));
    } else if (entry.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function listImmediateDirectories(root) {
  if (!existsSync(root)) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function getImportSpecifiers(source) {
  const specifiers = [];
  const staticImportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImportPattern)) {
    specifiers.push(match[1]);
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

function hasNamedExport(source, name) {
  return (
    new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|class|interface|type)\\s+${name}\\b`).test(
      source
    ) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)
  );
}

function isPathInside(candidate, parent) {
  const relativePath = path.relative(parent, candidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function difference(left, right) {
  return left.filter((value) => !right.includes(value));
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, "/");
}

assert.equal(path.basename(repoRoot), "uxp-webview-bridge");
