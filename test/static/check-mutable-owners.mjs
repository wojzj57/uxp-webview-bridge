import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src/uxp");
const manifestPath = path.resolve("test/static/mutable-owner-manifest.json");
const classifications = new Set(["immutable-catalog", "shared-coordinator", "candidate-session-owner"]);
const findings = [];

for (const file of await walk(root)) {
  const text = await readFile(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !isMutableOwner(statement.declarationList, declaration.initializer)) continue;
      const symbol = declaration.name.text;
      const classification = isImmutableCatalog(symbol, declaration.initializer)
        ? "immutable-catalog"
        : /^(?:hostRouter|bridgeOwnedModalCoordinator)$/.test(symbol)
          ? "shared-coordinator"
          : "candidate-session-owner";
      if (classification === "immutable-catalog") assertNoCatalogMutation(source, symbol, file);
      findings.push({
        file: path.relative(process.cwd(), file).replaceAll("\\", "/"),
        symbol,
        classification
      });
    }
  }
}

findings.sort((a, b) => `${a.file}:${a.symbol}`.localeCompare(`${b.file}:${b.symbol}`));
if (process.argv.includes("--write")) {
  await writeFile(manifestPath, `${JSON.stringify(findings, null, 2)}\n`, "utf8");
  console.log(`Wrote ${findings.length} mutable-owner classifications.`);
} else {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.ok(Array.isArray(manifest), "Mutable-owner manifest must be an array.");
  for (const entry of manifest) {
    assert.ok(classifications.has(entry.classification), `Invalid owner classification: ${entry.classification}`);
  }
  assert.deepEqual(manifest, findings, "Mutable-owner manifest is stale; run the checker with --write and classify the diff.");
  console.log(`Mutable-owner manifest checks passed (${findings.length} entries).`);
}

function isMutableOwner(declarationList, initializer) {
  if ((declarationList.flags & ts.NodeFlags.Let) !== 0) return true;
  if (!initializer) return false;
  if (ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression)) {
    return ["Map", "Set", "WeakMap", "WeakSet", "HostRouter", "BridgeOwnedModalCoordinator"].includes(initializer.expression.text);
  }
  return ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) &&
    ["createRemoteHandleRegistry", "createTemporaryDocumentOwner", "createCoreAdapterState", "createImagingAdapterState", "createUxpAdapterState", "createUxpXmpState"].includes(initializer.expression.text);
}

function isImmutableCatalog(symbol, initializer) {
  return /^[A-Z][A-Z0-9_]*$/.test(symbol) && initializer && ts.isNewExpression(initializer) &&
    ts.isIdentifier(initializer.expression) && initializer.expression.text === "Set";
}

function assertNoCatalogMutation(source, symbol, file) {
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === symbol &&
      ["add", "set", "delete", "clear"].includes(node.expression.name.text)) {
      assert.fail(`Immutable catalog ${symbol} is mutated in ${path.relative(process.cwd(), file)}.`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(location));
    else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) result.push(location);
  }
  return result;
}
