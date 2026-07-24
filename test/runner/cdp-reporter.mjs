const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  reset: "\x1b[0m"
};

export function formatCdpResult(result, options = {}) {
  const colorMode = options.color ?? "auto";
  const detail = options.detail ?? "compact";
  const useColor = shouldUseColor(colorMode, options.stdout ?? process.stdout);

  if (isSuiteResult(result)) {
    return detail === "verbose" ? formatVerboseSuiteResult(result, useColor) : formatCompactSuiteResult(result, useColor);
  }

  return detail === "verbose" ? formatVerboseCaseResult(result, useColor) : formatCompactCaseResult(result, useColor);
}

function formatCompactSuiteResult(result, useColor) {
  const cases = Array.isArray(result.cases) ? result.cases : [];
  const counts = countStatuses(cases);
  const maxCaseNameLength = Math.max(1, ...cases.map((testCase) => String(testCase.caseName ?? "").length));
  const lines = [
    `CDP suite: ${result.suiteName ?? "all"}  ${formatStatus(result.status, useColor)}`,
    `Cases: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped`,
    ""
  ];

  for (const testCase of cases) {
    lines.push(formatCompactCaseLine(testCase, useColor, maxCaseNameLength));
  }

  const failures = cases.filter((testCase) => testCase.status === "failed");
  if (failures.length > 0) {
    lines.push("", "Failures", "");
    for (const failure of failures) {
      lines.push(...formatFailureDetails(failure, useColor));
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatCompactCaseResult(result, useColor) {
  const lines = [formatCompactCaseLine(result, useColor, String(result.caseName ?? "").length)];
  if (result.status === "failed") {
    lines.push("", "Failure", "", ...formatFailureDetails(result, useColor));
  }
  return `${lines.join("\n")}\n`;
}

function formatCompactCaseLine(testCase, useColor, caseNameWidth) {
  const caseName = String(testCase.caseName ?? "<unknown>");
  const summary = summarizeCase(testCase);
  const suffix = summary ? `  ${summary}` : "";
  return `  ${formatStatus(testCase.status, useColor)}  ${caseName.padEnd(caseNameWidth)}${suffix}`;
}

function formatFailureDetails(testCase, useColor) {
  const lines = [`${formatStatus(testCase.status, useColor)} ${testCase.caseName}`];

  if (testCase.error !== undefined) {
    lines.push(indentBlock(`error: ${formatValue(testCase.error)}`, "  "));
  } else if (testCase.result !== undefined) {
    lines.push(indentBlock(`result: ${formatValue(testCase.result)}`, "  "));
  }

  if (testCase.diagnostics !== undefined) {
    lines.push(indentBlock(`diagnostics: ${formatValue(testCase.diagnostics)}`, "  "));
  }

  return lines;
}

function formatVerboseSuiteResult(result, useColor) {
  const cases = Array.isArray(result.cases) ? result.cases : [];
  const { passed, failed, skipped } = countStatuses(cases);
  const status = formatStatus(result.status, useColor);
  const lines = [
    `CDP suite ${result.suiteName ?? "all"}: ${status} (${passed} passed, ${failed} failed, ${skipped} skipped)`
  ];

  for (const testCase of cases) {
    lines.push(...formatVerboseCaseLines(testCase, useColor));
  }

  return `${lines.join("\n")}\n`;
}

function formatVerboseCaseResult(result, useColor) {
  return `${formatVerboseCaseLines(result, useColor).join("\n")}\n`;
}

function formatVerboseCaseLines(testCase, useColor) {
  const lines = [`  ${formatStatus(testCase.status, useColor)} ${testCase.caseName}`];

  if (testCase.result !== undefined) {
    lines.push(indentBlock(`result: ${formatValue(testCase.result)}`, "    "));
  }

  if (testCase.error !== undefined) {
    lines.push(indentBlock(`error: ${formatValue(testCase.error)}`, "    "));
  }

  if (testCase.diagnostics !== undefined) {
    lines.push(indentBlock(`diagnostics: ${formatValue(testCase.diagnostics)}`, "    "));
  }

  return lines;
}

function summarizeCase(testCase) {
  if (testCase.error) {
    return summarizeError(testCase.error);
  }

  return summarizeResult(testCase.result);
}

function summarizeError(error) {
  if (isPlainObject(error)) {
    if (typeof error.remoteMessage === "string") {
      return `${error.remoteName ?? "Error"}: ${truncate(error.remoteMessage)}`;
    }
    if (typeof error.message === "string") {
      return truncate(error.message);
    }
  }

  return truncate(String(error));
}

function summarizeResult(result) {
  if (result === undefined) {
    return "";
  }

  if (!isPlainObject(result)) {
    return formatScalar(result);
  }

  if (typeof result.remoteMessage === "string") {
    return `${result.remoteName ?? "RemoteError"}: ${truncate(result.remoteMessage)}`;
  }

  if (typeof result.ok === "boolean" && typeof result.hasUxpHost === "boolean") {
    return `ok=${result.ok}, hasUxpHost=${result.hasUxpHost}`;
  }

  if (typeof result.platform === "string") {
    return `platform=${result.platform}`;
  }

  if (typeof result.bytes === "number") {
    return `bytes=${result.bytes}`;
  }

  if (typeof result.joined === "string") {
    return `joined=${result.joined}`;
  }

  if (typeof result.name === "string" && typeof result.version === "string") {
    const uxpVersion = typeof result.uxpVersion === "string" ? `, UXP ${result.uxpVersion}` : "";
    return `${result.name} ${result.version}${uxpVersion}`;
  }

  const entries = Object.entries(result);
  if (entries.length > 0 && entries.every(([, value]) => value === true)) {
    return `${entries.length} checks passed`;
  }

  const scalarEntries = entries.filter(([, value]) => isScalar(value)).slice(0, 3);
  if (scalarEntries.length > 0) {
    return scalarEntries.map(([key, value]) => `${key}=${formatScalar(value)}`).join(", ");
  }

  return `${entries.length} fields`;
}

function countStatuses(cases) {
  return {
    passed: cases.filter((testCase) => testCase.status === "passed").length,
    failed: cases.filter((testCase) => testCase.status === "failed").length,
    skipped: cases.filter((testCase) => testCase.status === "skipped").length
  };
}

function formatStatus(status, useColor) {
  if (status === "passed") {
    return color("[PASS]", "green", useColor);
  }
  if (status === "failed") {
    return color("[FAIL]", "red", useColor);
  }
  if (status === "skipped") {
    return color("[SKIP]", "yellow", useColor);
  }
  return color(`[${String(status).toUpperCase()}]`, "dim", useColor);
}

function formatValue(value) {
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  return JSON.stringify(value);
}

function formatScalar(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function isScalar(value) {
  return value === null || ["boolean", "number", "string"].includes(typeof value);
}

function truncate(value, maxLength = 96) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function indentBlock(text, indent) {
  return text
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function isSuiteResult(result) {
  return result && typeof result === "object" && Array.isArray(result.cases);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function color(text, colorName, useColor) {
  if (!useColor) {
    return text;
  }
  return `${COLORS[colorName]}${text}${COLORS.reset}`;
}

function shouldUseColor(colorMode, stdout) {
  if (colorMode === "always") {
    return true;
  }
  if (colorMode === "never" || process.env.NO_COLOR) {
    return false;
  }
  return Boolean(stdout.isTTY || process.env.FORCE_COLOR);
}
