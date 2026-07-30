import assert from "node:assert/strict";
import { test } from "node:test";

import { REQUIRED_MULTI_WEBVIEW_CASES } from "../runner/uxp-compatibility-artifact.mjs";
import { evaluateSuiteStatus } from "../runner/cdp-run-policy.mjs";

test("required RFC-0025 skips fail the real suite while unrelated skips remain allowed", () => {
  const required = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({ caseName, status: "passed" }));
  required[2] = { ...required[2], status: "skipped" };
  assert.equal(evaluateSuiteStatus([...required, { caseName: "optional.case", status: "skipped" }]), "failed");

  required[2] = { ...required[2], status: "passed" };
  assert.equal(evaluateSuiteStatus([...required, { caseName: "optional.case", status: "skipped" }]), "passed");
});
