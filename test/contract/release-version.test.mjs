import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublishedPackages,
  resolveReleaseVersion
} from "../../scripts/resolve-release-version.mjs";

const currentPackage = {
  name: "uxp-webview-bridge",
  version: "0.2.0"
};

test("resolveReleaseVersion uses the Changesets published package output", () => {
  assert.equal(
    resolveReleaseVersion({
      currentPackage,
      publishedPackages: [{ name: "uxp-webview-bridge", version: "0.2.0" }]
    }),
    "0.2.0"
  );
});

test("resolveReleaseVersion falls back to a package version change", () => {
  assert.equal(
    resolveReleaseVersion({
      currentPackage,
      previousPackage: { name: "uxp-webview-bridge", version: "0.1.0" }
    }),
    "0.2.0"
  );
});

test("resolveReleaseVersion ignores commits without a version change", () => {
  assert.equal(
    resolveReleaseVersion({
      currentPackage,
      previousPackage: { name: "uxp-webview-bridge", version: "0.2.0" }
    }),
    ""
  );
});

test("resolveReleaseVersion accepts a matching repair version", () => {
  assert.equal(
    resolveReleaseVersion({ currentPackage, repairVersion: "0.2.0" }),
    "0.2.0"
  );
});

test("resolveReleaseVersion rejects a mismatched repair version", () => {
  assert.throws(
    () => resolveReleaseVersion({ currentPackage, repairVersion: "0.1.0" }),
    /repair_version must match package\.json \(0\.2\.0\)/u
  );
});

test("resolveReleaseVersion rejects mismatched Changesets output", () => {
  assert.throws(
    () =>
      resolveReleaseVersion({
        currentPackage,
        publishedPackages: [{ name: "uxp-webview-bridge", version: "0.3.0" }]
      }),
    /does not match uxp-webview-bridge@0\.2\.0/u
  );
});

test("parsePublishedPackages handles missing and valid action output", () => {
  assert.deepEqual(parsePublishedPackages(undefined), []);
  assert.deepEqual(
    parsePublishedPackages('[{"name":"uxp-webview-bridge","version":"0.2.0"}]'),
    [{ name: "uxp-webview-bridge", version: "0.2.0" }]
  );
});

test("parsePublishedPackages rejects non-array JSON", () => {
  assert.throws(() => parsePublishedPackages("{}"), /must be a JSON array/u);
});
