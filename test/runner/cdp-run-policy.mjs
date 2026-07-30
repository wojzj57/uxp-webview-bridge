import { REQUIRED_MULTI_WEBVIEW_CASES } from "./uxp-compatibility-artifact.mjs";

const requiredCases = new Set(REQUIRED_MULTI_WEBVIEW_CASES);

export function evaluateSuiteStatus(cases) {
  return cases.some((result) =>
    result?.status === "failed" ||
    (requiredCases.has(result?.caseName) && result?.status !== "passed")
  ) ? "failed" : "passed";
}
