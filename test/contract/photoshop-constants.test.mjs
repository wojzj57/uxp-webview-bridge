import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const constantsSource = new URL(
  "../../src/shared/types/photoshop/internal/dom/Constants.d.ts",
  import.meta.url
);
const layerSource = new URL(
  "../../src/shared/types/photoshop/internal/dom/Layer.d.ts",
  import.meta.url
);
const constantsModule = "../../dist/shared/photoshop-api/photoshop-constants.js";
const photoshopModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";

test("all declared Photoshop enums are exact synchronous WebView constants", async () => {
  const declarations = await readDeclaredEnums();
  const { PhotoshopConstants } = await import(constantsModule);
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const photoshop = createPhotoshopNamespace({
    call() {
      throw new Error("reading synchronous constants must not call RPC");
    }
  });

  assert.equal(declarations.size, 103, "102 Constants.d.ts enums plus PSLayerKind should be generated");
  assert.deepEqual(Object.keys(PhotoshopConstants), [...declarations.keys()]);
  assert.equal(Object.keys(photoshop.constants).length, declarations.size);

  for (const [name, expected] of declarations) {
    assert.deepEqual(PhotoshopConstants[name], expected, `${name} drifted from Constants.d.ts`);
    assert.equal(photoshop[name], PhotoshopConstants[name], `photoshop.${name} should be synchronous`);
    assert.equal(photoshop.constants[name], PhotoshopConstants[name], `photoshop.constants.${name} should share identity`);
    assert.equal(typeof photoshop[name]?.then, "undefined", `photoshop.${name} must not be Promise-like`);
  }

  const publicConstantKeys = Object.keys(photoshop).filter((name) => name in PhotoshopConstants || name === "ColorConversionModel");
  assert.equal(publicConstantKeys.length, 104, "103 generated enums plus ColorConversionModel should be public");
});

async function readDeclaredEnums() {
  const declarations = new Map();

  for (const { source, include } of [
    { source: constantsSource, include: () => true },
    { source: layerSource, include: (name) => name === "PSLayerKind" }
  ]) {
    const sourceText = await readFile(source, "utf8");
    const sourceFile = ts.createSourceFile(source.pathname, sourceText, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (!ts.isEnumDeclaration(statement) || !include(statement.name.text)) {
        continue;
      }
      const members = {};
      for (const member of statement.members) {
        const name = member.name.text;
        if (ts.isStringLiteral(member.initializer)) {
          members[name] = member.initializer.text;
        } else if (ts.isNumericLiteral(member.initializer)) {
          members[name] = Number(member.initializer.text);
        } else {
          assert.fail(`unsupported initializer for ${statement.name.text}.${name}`);
        }
      }
      declarations.set(statement.name.text, members);
    }
  }

  return declarations;
}
