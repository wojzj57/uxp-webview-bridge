import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parsePublishedPackages(value) {
  if (!value?.trim()) {
    return [];
  }

  const packages = JSON.parse(value);
  if (!Array.isArray(packages)) {
    throw new Error("PUBLISHED_PACKAGES must be a JSON array.");
  }

  return packages;
}

export function resolveReleaseVersion({
  currentPackage,
  previousPackage,
  publishedPackages = [],
  repairVersion = ""
}) {
  assertPackageIdentity(currentPackage, "current package.json");

  if (repairVersion) {
    if (repairVersion !== currentPackage.version) {
      throw new Error(
        `repair_version must match package.json (${currentPackage.version}).`
      );
    }
    return repairVersion;
  }

  if (publishedPackages.length > 0) {
    if (publishedPackages.length !== 1) {
      throw new Error("Expected exactly one published package.");
    }

    const [publishedPackage] = publishedPackages;
    assertPackageIdentity(publishedPackage, "published package");
    if (
      publishedPackage.name !== currentPackage.name ||
      publishedPackage.version !== currentPackage.version
    ) {
      throw new Error(
        `Published package ${publishedPackage.name}@${publishedPackage.version} does not match ${currentPackage.name}@${currentPackage.version}.`
      );
    }
    return publishedPackage.version;
  }

  if (!previousPackage) {
    return "";
  }

  assertPackageIdentity(previousPackage, "previous package.json");
  return previousPackage.version === currentPackage.version ? "" : currentPackage.version;
}

function assertPackageIdentity(packageJson, label) {
  if (
    !packageJson ||
    typeof packageJson.name !== "string" ||
    !packageJson.name ||
    typeof packageJson.version !== "string" ||
    !packageJson.version
  ) {
    throw new Error(`${label} must contain non-empty name and version fields.`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readPreviousPackage() {
  const { stdout } = await execFileAsync("git", ["show", "HEAD^:package.json"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return JSON.parse(stdout);
}

async function main() {
  const currentPackage = await readJson(path.join(repoRoot, "package.json"));
  const publishedPackages = parsePublishedPackages(process.env.PUBLISHED_PACKAGES);
  const repairVersion = process.env.REPAIR_VERSION?.trim() ?? "";
  const immediateVersion = resolveReleaseVersion({
    currentPackage,
    publishedPackages,
    repairVersion
  });

  if (immediateVersion) {
    process.stdout.write(immediateVersion);
    return;
  }

  const previousPackage = await readPreviousPackage();
  const version = resolveReleaseVersion({
    currentPackage,
    previousPackage,
    publishedPackages
  });
  process.stdout.write(version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
