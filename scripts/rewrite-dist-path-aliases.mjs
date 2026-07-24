import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");
const aliasTargets = new Map([
  ["@shared", path.join(distRoot, "shared")],
  ["@shared-types/photoshop", path.join(distRoot, "shared", "types", "photoshop", "src")],
  ["@shared-types/uxp", path.join(distRoot, "shared", "types", "uxp", "src")],
  ["@webview", path.join(distRoot, "webview")],
  ["@uxp", path.join(distRoot, "uxp")]
]);

await rewriteFiles(distRoot);

async function rewriteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteFiles(fullPath);
    } else if (entry.isFile() && shouldRewriteFile(fullPath)) {
      await rewriteFile(fullPath);
    }
  }
}

function shouldRewriteFile(filePath) {
  return filePath.endsWith(".js") || filePath.endsWith(".d.ts");
}

async function rewriteFile(filePath) {
  const source = await readFile(filePath, "utf8");
  const rewritten = source.replace(
    /((?:from\s+|import\s*\(\s*)["'])(@(?:shared-types\/photoshop|shared-types\/uxp|shared|webview|uxp)\/([^"']+))(["'])/g,
    (match, prefix, specifier, rest, quote) => {
      const aliasName = [...aliasTargets.keys()]
        .sort((left, right) => right.length - left.length)
        .find((candidate) => specifier === candidate || specifier.startsWith(`${candidate}/`));
      if (!aliasName) {
        return match;
      }

      const targetRoot = aliasTargets.get(aliasName);
      if (!targetRoot) {
        return match;
      }

      const targetPath = path.join(targetRoot, specifier.slice(aliasName.length + 1));
      let relativeSpecifier = path
        .relative(path.dirname(filePath), targetPath)
        .replaceAll(path.sep, "/");

      if (!relativeSpecifier.startsWith(".")) {
        relativeSpecifier = `./${relativeSpecifier}`;
      }

      return `${prefix}${relativeSpecifier}${quote}`;
    }
  );

  if (rewritten !== source) {
    await writeFile(filePath, rewritten);
  }
}
