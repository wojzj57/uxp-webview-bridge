import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADOBE_PHOTOSHOP_CORE_MEMBERS,
  PHOTOSHOP_CORE_CALLBACK_MEMBERS,
  PHOTOSHOP_CORE_NON_CALLBACK_MEMBERS
} from "./photoshop-core-baseline.mjs";

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

await checkNoDeepRelativeImports();
await checkWebviewEntrypoint();
await checkUxpEntrypoint();
await checkDeprecatedSetupApis();
await checkSymmetricModuleDirectories("uxp-api");
await checkSymmetricModuleDirectories("photoshop-api");
await checkSymmetricGlobalMemberDirectories("uxp-api");
await checkSharedNativeTypes();
await checkWebviewUxpModuleDoesNotOwnTypesDirectory();
await checkWebviewUxpApiTypesAreLocal();
await checkNoProductionTestHelperImports();
await checkNoProductionDiagnosticBackdoors();
await checkWebviewCdpTestImports();
await checkWebviewCdpCaseNames();
await checkCdpCaseOwnership();
await checkPhotoshopCoreParity();
await checkRemoteResultApi();

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

async function checkNoDeepRelativeImports() {
  for (const file of await listFiles(srcRoot, ".ts")) {
    const source = await readFile(file, "utf8");
    for (const specifier of getImportSpecifiers(source)) {
      if (specifier.startsWith("../..")) {
        failures.push(
          `${relative(file)} imports ${specifier}; use ../ only for one parent, otherwise use a tsconfig path alias`
        );
      }
    }
  }
}

async function checkWebviewEntrypoint() {
  const file = path.join(webviewRoot, "index.ts");
  const source = await readFile(file, "utf8");
  for (const exportedName of [
    "clipboard",
    "configWebviewBridge",
    "ActionNotificationListener",
    "CorePoint",
    "CreateTemporaryDocumentOptions",
    "CreateTemporaryDocumentResult",
    "crypto",
    "DeleteTemporaryDocumentOptions",
    "fs",
    "localStorage",
    "os",
    "path",
    "RedrawDocumentOptions",
    "RemoteResult",
    "SetExecutionModeOptions",
    "ShowAlertOptions",
    "SuppressResizeGripperOptions",
    "SuspendHistoryContext",
    "sessionStorage",
    "uxp"
  ]) {
    if (!hasNamedExport(source, exportedName)) {
      failures.push(`src/webview/index.ts must export ${exportedName}`);
    }
  }
}

async function checkRemoteResultApi() {
  const typeFiles = [
    path.join(webviewRoot, "photoshop-api", "modules", "photoshop", "types.ts"),
    path.join(webviewRoot, "photoshop-api", "modules", "imaging", "types.ts"),
    path.join(webviewRoot, "uxp-api", "modules", "uxp", "persistent-file-storage", "types.ts"),
    path.join(webviewRoot, "uxp-api", "modules", "uxp", "xmp", "types.ts")
  ];
  const singleRemoteTypes = [
    "PsDocument",
    "PsLayer",
    "PsChannel",
    "PsHistoryState",
    "PsGuide",
    "PsPathItem",
    "PsPathPoint",
    "PsSubPathItem",
    "PsSelection",
    "PsColorSampler",
    "PsCountItem",
    "PsLayerComp",
    "TextItem",
    "CharacterStyle",
    "ParagraphStyle",
    "TextWarpStyle",
    "TextFont",
    "Action",
    "ActionSet",
    "Tool",
    "Preferences",
    "PreferencesGeneral",
    "PreferencesInterface",
    "PreferencesTools",
    "PreferencesHistory",
    "PreferencesFileHandling",
    "PreferencesPerformance",
    "PreferencesCursors",
    "PreferencesTransparencyAndGamut",
    "PreferencesUnitsAndRulers",
    "PreferencesGuidesGridsAndSlices",
    "PreferencesType",
    "PreferencesNotifications",
    "XMPMeta",
    "XMPIterator",
    "UxpStorageEntry",
    "UxpStorageFile",
    "UxpStorageFolder",
    "PsImageData"
  ];
  const plainPromise = new RegExp(
    `Promise\\s*<\\s*(?:${singleRemoteTypes.join("|")})(?:\\s*\\|\\s*(?:null|undefined))*\\s*>`,
    "g"
  );

  for (const file of typeFiles) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(plainPromise)) {
      failures.push(
        `${relative(file)} declares ${match[0]} for a single remote object; use RemoteResult so both await forms remain supported`
      );
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

async function checkNoProductionDiagnosticBackdoors() {
  const forbidden = new Map([
    ["uxp-webview-bridge.internal.host-diagnostics", "global diagnostic Symbol"],
    ["__testCleanupPolicy", "private setup cleanup policy"],
    ["snapshotDiagnostics", "diagnostic-only production snapshot surface"],
    ["sessionDiagnostics", "unbounded historical session owner retention"]
  ]);
  for (const file of await listFiles(srcRoot, ".ts")) {
    const source = await readFile(file, "utf8");
    for (const [token, label] of forbidden) {
      if (source.includes(token)) failures.push(`${relative(file)} contains forbidden ${label}: ${token}`);
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
  const refactorOnlyUxpModules = new Set(["fetch"]);

  for (const moduleName of difference(webviewModules, uxpModules)) {
    failures.push(`missing UXP module directory for ${apiName}/${moduleName}`);
  }

  for (const moduleName of difference(uxpModules, webviewModules)) {
    if (apiName === "uxp-api" && refactorOnlyUxpModules.has(moduleName)) {
      continue;
    }
    failures.push(`missing WebView module directory for ${apiName}/${moduleName}`);
  }
}

async function checkSymmetricGlobalMemberDirectories(apiName) {
  const webviewGlobalMembersRoot = path.join(webviewRoot, apiName, "global-members");
  const uxpGlobalMembersRoot = path.join(uxpRoot, apiName, "global-members");

  if (!existsSync(webviewGlobalMembersRoot) && !existsSync(uxpGlobalMembersRoot)) {
    return;
  }

  const webviewGlobalMembers = await listImmediateDirectories(webviewGlobalMembersRoot);
  const uxpGlobalMembers = await listImmediateDirectories(uxpGlobalMembersRoot);

  for (const moduleName of difference(webviewGlobalMembers, uxpGlobalMembers)) {
    failures.push(`missing UXP global member directory for ${apiName}/${moduleName}`);
  }

  for (const moduleName of difference(uxpGlobalMembers, webviewGlobalMembers)) {
    failures.push(`missing WebView global member directory for ${apiName}/${moduleName}`);
  }
}

async function checkSharedNativeTypes() {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const devDependencies = packageJson.devDependencies ?? {};
  for (const packageName of ["@adobe-uxp-types/photoshop", "@adobe-uxp-types/uxp"]) {
    if (Object.hasOwn(devDependencies, packageName)) {
      failures.push(`${packageName} must be mirrored under src/shared/types, not kept as a dependency`);
    }
  }

  for (const typeRoot of [
    path.join(srcRoot, "shared", "types", "photoshop", "internal"),
    path.join(srcRoot, "shared", "types", "uxp", "internal")
  ]) {
    if (!existsSync(typeRoot)) {
      failures.push(`missing shared native type root ${relative(typeRoot)}`);
      continue;
    }

    for (const file of await listFiles(typeRoot, ".d.ts")) {
      const source = await readFile(file, "utf8");
      if (/^\s*(?!export\s+)(?!declare\s+)interface\s+\w+/m.test(source)) {
        failures.push(`${relative(file)} contains a non-exported interface`);
      }
    }
  }
}

async function checkWebviewUxpApiTypesAreLocal() {
  const webviewUxpRoot = path.join(webviewRoot, "uxp-api", "modules", "uxp");
  if (!existsSync(webviewUxpRoot)) {
    return;
  }
  const forbiddenSharedApiTypes = [
    "UxpNamespace",
    "UxpHostInformation",
    "UxpVersions",
    "UxpShell",
    "UxpUserInfo",
    "UxpPlugin",
    "UxpPluginManager",
    "UxpScript",
    "UxpMenuItem",
    "UxpMenuItems",
    "UxpPanelInfo",
    "UxpCommandInfo",
    "UxpSecureStorage",
    "UxpStorage",
    "UxpLocalFileSystemProvider",
    "UxpXmpNamespace"
  ];

  for (const file of await listFiles(webviewUxpRoot, ".ts")) {
    const source = await readFile(file, "utf8");
    const importsSharedUxpContract = /from\s+["'][^"']*shared\/contracts\/uxp\.js["']/.test(
      source.replaceAll("\\", "/")
    );
    if (!importsSharedUxpContract) {
      continue;
    }

    for (const typeName of forbiddenSharedApiTypes) {
      if (new RegExp(`\\b${typeName}\\b`).test(source)) {
        failures.push(
          `${relative(file)} imports WebView UXP API type ${typeName} from shared contract; use ./remote-types.js`
        );
      }
    }
  }
}

async function checkWebviewUxpModuleDoesNotOwnTypesDirectory() {
  const webviewUxpTypesRoot = path.join(webviewRoot, "uxp-api", "modules", "uxp", "types");
  if (existsSync(webviewUxpTypesRoot)) {
    failures.push(
      "src/webview/uxp-api/modules/uxp/types must not exist; use src/shared/types/uxp for native UXP types"
    );
  }
}

async function checkNoProductionTestHelperImports() {
  for (const file of await listFiles(srcRoot, ".ts")) {
    if (isTestFile(file)) {
      continue;
    }

    const source = await readFile(file, "utf8");
    for (const specifier of getImportSpecifiers(source)) {
      if (specifier.startsWith("@test/")) {
        failures.push(`${relative(file)} imports ${specifier}; @test imports are only allowed in test files`);
      }
    }
  }
}

async function checkWebviewCdpTestImports() {
  const forbiddenNodeImports = new Set([
    "assert",
    "buffer",
    "child_process",
    "crypto",
    "fs",
    "node:assert",
    "node:buffer",
    "node:child_process",
    "node:crypto",
    "node:fs",
    "node:os",
    "node:path",
    "node:process",
    "os",
    "path",
    "process"
  ]);

  for (const file of await listFiles(webviewRoot, ".test.ts")) {
    const source = await readFile(file, "utf8");
    for (const record of getImportRecords(source)) {
      if (forbiddenNodeImports.has(record.specifier)) {
        failures.push(`${relative(file)} imports ${record.specifier}; WebView CDP tests run in a WebView, not Node`);
      }

      if (!record.typeOnly && record.specifier.startsWith(".")) {
        failures.push(
          `${relative(file)} value-imports ${record.specifier}; WebView CDP tests must use ctx.bridge instead of local implementations`
        );
      }
    }
  }
}

async function checkWebviewCdpCaseNames() {
  for (const file of await listFiles(webviewRoot, ".test.ts")) {
    const prefix = getWebviewCdpCasePrefix(file);
    if (!prefix) {
      failures.push(`${relative(file)} is not under a supported WebView CDP test module directory`);
      continue;
    }

    const source = await readFile(file, "utf8");
    const caseNames = getCaseNames(source);
    if (caseNames.length === 0) {
      failures.push(`${relative(file)} must define at least one named CDP case`);
      continue;
    }

    for (const caseName of caseNames) {
      if (!caseName.startsWith(`${prefix}.`)) {
        failures.push(`${relative(file)} defines ${caseName}; expected case names to start with ${prefix}.`);
      }
    }
  }
}

async function checkCdpCaseOwnership() {
  const cdpCasesRoot = path.join(repoRoot, "test", "cdp", "cases");
  const moduleCasePrefixes = ["fs.", "os.", "path.", "photoshop.", "uxp."];

  for (const file of await listFiles(cdpCasesRoot, ".mjs")) {
    const caseName = path.basename(file, ".mjs");
    for (const prefix of moduleCasePrefixes) {
      if (caseName.startsWith(prefix)) {
        failures.push(`${relative(file)} is a module case; put it next to the WebView module as *.test.ts`);
      }
    }
  }
}

async function checkPhotoshopCoreParity() {
  assert.equal(ADOBE_PHOTOSHOP_CORE_MEMBERS.length, 31);
  assert.equal(PHOTOSHOP_CORE_NON_CALLBACK_MEMBERS.length, 28);
  assert.deepEqual(PHOTOSHOP_CORE_CALLBACK_MEMBERS, [
    "addNotificationListener",
    "removeNotificationListener",
    "executeAsModal"
  ]);

  const partition = [
    ...PHOTOSHOP_CORE_NON_CALLBACK_MEMBERS,
    ...PHOTOSHOP_CORE_CALLBACK_MEMBERS
  ];
  assert.deepEqual(sortedUnique(partition), sortedUnique(ADOBE_PHOTOSHOP_CORE_MEMBERS));

  const protocolFile = path.join(srcRoot, "shared", "photoshop-api", "core-protocol.ts");
  const protocolSource = await readFile(protocolFile, "utf8");
  const documentedBlock = protocolSource.match(
    /ADOBE_PHOTOSHOP_CORE_MEMBER_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/
  );
  if (!documentedBlock) {
    failures.push(`${relative(protocolFile)} must declare the independent Adobe Core baseline`);
  } else {
    checkExactCoreMembers(
      "shared documented Core baseline",
      extractQuotedMembers(documentedBlock[1])
    );
  }

  const callbackBlock = protocolSource.match(
    /PHOTOSHOP_CORE_CALLBACK_MEMBER_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/
  );
  if (!callbackBlock) {
    failures.push(`${relative(protocolFile)} must declare the three callback Core members`);
  } else {
    checkExpectedMembers(
      "shared callback Core baseline",
      extractQuotedMembers(callbackBlock[1]),
      PHOTOSHOP_CORE_CALLBACK_MEMBERS
    );
  }

  const protocolBlock = protocolSource.match(
    /PHOTOSHOP_CORE_METHOD_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/
  );
  if (!protocolBlock) {
    failures.push(`${relative(protocolFile)} must declare PHOTOSHOP_CORE_METHOD_NAMES as a const array`);
  } else {
    const protocolMembers = [...protocolBlock[1].matchAll(/["']core\.([A-Za-z][A-Za-z0-9]*)["']/g)]
      .map((match) => match[1]);
    checkCoreProtocolMembers(protocolMembers);
  }

  const webviewTypesFile = path.join(
    webviewRoot,
    "photoshop-api",
    "modules",
    "core",
    "types.ts"
  );
  const webviewTypesSource = await readFile(webviewTypesFile, "utf8");
  const interfaceBlock = webviewTypesSource.match(
    /export interface PhotoshopCore\s*{([\s\S]*?)^}/m
  );
  if (!interfaceBlock) {
    failures.push(`${relative(webviewTypesFile)} must export interface PhotoshopCore`);
  } else {
    const publicMembers = [...interfaceBlock[1].matchAll(/^\s{2}(?:readonly\s+)?([A-Za-z][A-Za-z0-9]*)\s*(?:<|\(|:)/gm)]
      .map((match) => match[1]);
    checkExactCoreMembers("WebView PhotoshopCore interface", publicMembers);
  }

  const coreCdpFile = path.join(
    webviewRoot,
    "photoshop-api",
    "modules",
    "core",
    "core.test.ts"
  );
  const coreCdpSource = await readFile(coreCdpFile, "utf8");
  if (/\.activeDocument\b/.test(coreCdpSource)) {
    failures.push(`${relative(coreCdpFile)} must not use a user's activeDocument as fixture state`);
  }
  for (const requiredLifecycleCall of ["createDocument", "closeWithoutSaving"]) {
    if (!new RegExp(`\\.${requiredLifecycleCall}\\s*\\(`).test(coreCdpSource)) {
      failures.push(
        `${relative(coreCdpFile)} must use ${requiredLifecycleCall} for fixture-owned document lifecycle`
      );
    }
  }

  const hostMembers = [];
  for (const hostFile of await listFiles(uxpRoot, ".ts")) {
    const hostSource = await readFile(hostFile, "utf8");
    hostMembers.push(
      ...[...hostSource.matchAll(/["']core\.([A-Za-z][A-Za-z0-9]*)["']/g)]
        .map((match) => match[1])
    );
  }
  checkExactCoreMembers("UXP Core host dispatch", sortedUnique(hostMembers));
}

function checkCoreProtocolMembers(actualMembers) {
  const actual = sortedUnique(actualMembers);
  const missingNonCallback = PHOTOSHOP_CORE_NON_CALLBACK_MEMBERS.filter(
    (member) => !actual.includes(member)
  );
  const extra = actual.filter((member) => !ADOBE_PHOTOSHOP_CORE_MEMBERS.includes(member));
  if (missingNonCallback.length > 0 || extra.length > 0 || actualMembers.length !== actual.length) {
    failures.push(
      `shared Core protocol must route all 28 non-callback members and no non-Adobe names; missing=[${missingNonCallback.join(", ")}], extra=[${extra.join(", ")}], duplicates=${actualMembers.length - actual.length}`
    );
  }
}

function checkExactCoreMembers(label, actualMembers) {
  checkExpectedMembers(label, actualMembers, ADOBE_PHOTOSHOP_CORE_MEMBERS);
}

function checkExpectedMembers(label, actualMembers, expectedMembers) {
  const actual = sortedUnique(actualMembers);
  const expected = sortedUnique(expectedMembers);
  const missing = expected.filter((member) => !actual.includes(member));
  const extra = actual.filter((member) => !expected.includes(member));
  if (missing.length > 0 || extra.length > 0 || actualMembers.length !== actual.length) {
    failures.push(
      `${label} must match its ${expected.length}-member baseline; missing=[${missing.join(", ")}], extra=[${extra.join(", ")}], duplicates=${actualMembers.length - actual.length}`
    );
  }
}

function extractQuotedMembers(source) {
  return [...source.matchAll(/["']([A-Za-z][A-Za-z0-9]*)["']/g)].map((match) => match[1]);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
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
  return getImportRecords(source).map((record) => record.specifier);
}

function getImportRecords(source) {
  const specifiers = [];
  const staticImportPattern = /^\s*(?:import|export)\s+(type\s+)?(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/gm;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImportPattern)) {
    specifiers.push({
      specifier: match[2],
      typeOnly: match[1] === "type "
    });
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    specifiers.push({
      specifier: match[1],
      typeOnly: false
    });
  }

  return specifiers;
}

function getCaseNames(source) {
  return [...source.matchAll(/\bname\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function getWebviewCdpCasePrefix(file) {
  const parts = path.relative(webviewRoot, file).split(path.sep);

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

function isTestFile(file) {
  return file.endsWith(".test.ts") || file.endsWith(".spec.ts");
}

function hasNamedExport(source, name) {
  return (
    new RegExp(`\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|class|interface|type)\\s+${name}\\b`).test(
      source
    ) || new RegExp(`\\bexport\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}`).test(source)
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
