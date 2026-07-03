import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(repoRoot, "src", "types", "uxp", "internal");
const targetRoot = path.join(
  repoRoot,
  "src",
  "webview",
  "uxp-api",
  "modules",
  "uxp",
  "types",
  "native"
);
const distTargetRoot = path.join(
  repoRoot,
  "dist",
  "webview",
  "uxp-api",
  "modules",
  "uxp",
  "types",
  "native"
);

const files = [
  "entrypoints.d.ts",
  "host.d.ts",
  "plugin-manager.d.ts",
  "script.d.ts",
  "shell.d.ts",
  "storage.d.ts",
  "user-info.d.ts",
  "versions.d.ts"
];

await mkdir(targetRoot, { recursive: true });

for (const file of files) {
  const source = path.join(sourceRoot, file);
  const target = path.join(targetRoot, file);
  await copyFile(source, target);
}

if (process.argv.includes("--dist")) {
  await mkdir(distTargetRoot, { recursive: true });
  for (const file of files) {
    await copyFile(path.join(targetRoot, file), path.join(distTargetRoot, file));
  }
}

if (process.argv.includes("--check")) {
  const mismatches = [];
  for (const file of files) {
    const source = await readFile(path.join(sourceRoot, file), "utf8");
    const target = await readFile(path.join(targetRoot, file), "utf8").catch(() => undefined);
    if (source !== target) {
      mismatches.push(file);
    }
  }

  if (mismatches.length > 0) {
    console.error(`UXP WebView native type mirror is stale: ${mismatches.join(", ")}`);
    process.exit(1);
  }
}
