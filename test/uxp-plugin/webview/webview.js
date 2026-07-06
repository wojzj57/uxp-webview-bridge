import {
  clipboard,
  configWebviewBridge,
  crypto,
  fs,
  localStorage,
  os,
  path,
  sessionStorage,
  uxp
} from "../dist/webview/index.js";
import { cases } from "./generated/case-registry.js";

const READY_TYPE = "uxp-webview-bridge:webview-ready";
const RUN_TYPE = "uxp-webview-bridge:test-run";
const RESULT_TYPE = "uxp-webview-bridge:test-result";
const SKIP_RESULT = Symbol("uxp-webview-bridge:skip-result");

const statusElement = document.getElementById("status");
let bridgeRuntime;

window.__UXP_BRIDGE_TEST_CASES__ = cases;

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object" || data.type !== RUN_TYPE) {
    return;
  }

  void runCase(data);
});

postToHost({
  type: READY_TYPE,
  href: window.location.href,
  caseNames: Object.keys(cases)
});

async function runCase(request) {
  const caseName = request.caseName || "bridge.ping";
  const startedAt = Date.now();
  const loadCase = cases[caseName];

  if (!loadCase) {
    postResult({
      id: request.id,
      caseName,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: normalizeError(new Error(`Unknown test case: ${caseName}`)),
      diagnostics: { availableCases: Object.keys(cases) }
    });
    return;
  }

  try {
    setStatus(`running ${caseName}`);
    const module = await loadCase();
    const testCase = module.default;
    if (typeof testCase !== "function") {
      throw new Error(`CDP case ${caseName} must export a default function.`);
    }

    const result = await testCase(createCaseContext(request));
    const durationMs = Date.now() - startedAt;

    if (isSkipResult(result)) {
      setStatus(`skipped ${caseName}`);
      postResult({
        id: request.id,
        caseName,
        status: "skipped",
        durationMs,
        skipReason: result.reason,
        diagnostics: result.diagnostics
      });
      return;
    }

    setStatus(`passed ${caseName}`);
    postResult({
      id: request.id,
      caseName,
      status: "passed",
      durationMs,
      result
    });
  } catch (error) {
    setStatus(`failed ${caseName}`);
    postResult({
      id: request.id,
      caseName,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: normalizeError(error)
    });
  }
}

function createCaseContext(request) {
  return {
    payload: request.payload ?? null,
    bridge: {
      ensureConfigured,
      clipboard,
      crypto,
      fs,
      localStorage,
      os,
      path,
      sessionStorage,
      uxp
    },
    assert: createAssert(),
    skip
  };
}

function ensureConfigured() {
  bridgeRuntime ??= configWebviewBridge();
  return bridgeRuntime;
}

function createAssert() {
  return {
    ok(value, message = "Expected value to be truthy") {
      if (!value) {
        throw new AssertionError(message);
      }
    },

    equal(actual, expected, message = `Expected ${String(actual)} to equal ${String(expected)}`) {
      if (actual !== expected) {
        throw new AssertionError(message);
      }
    },

    match(value, pattern, message = `Expected ${String(value)} to match ${String(pattern)}`) {
      if (typeof value !== "string" || !pattern.test(value)) {
        throw new AssertionError(message);
      }
    },

    nonEmptyString(value, label = "value") {
      if (typeof value !== "string" || value.length === 0) {
        throw new AssertionError(`${label} must be a non-empty string.`);
      }
    },

    objectHasKeys(value, keys, label = "object") {
      if (!value || typeof value !== "object") {
        throw new AssertionError(`${label} must be an object.`);
      }

      for (const key of keys) {
        if (!(key in value)) {
          throw new AssertionError(`${label} must include key ${key}.`);
        }
      }
    },

    functions(value, names, label = "object") {
      if (!value || typeof value !== "object") {
        throw new AssertionError(`${label} must be an object.`);
      }

      for (const name of names) {
        if (typeof value[name] !== "function") {
          throw new AssertionError(`${label}.${name} must be a function.`);
        }
      }
    }
  };
}

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

function skip(reason, diagnostics) {
  return {
    [SKIP_RESULT]: true,
    reason,
    diagnostics
  };
}

function isSkipResult(value) {
  return Boolean(value && typeof value === "object" && value[SKIP_RESULT] === true);
}

function postResult(result) {
  postToHost({
    type: RESULT_TYPE,
    ...result
  });
}

function postToHost(message) {
  if (typeof window.uxpHost === "undefined") {
    setStatus("window.uxpHost is not available");
    return;
  }

  window.uxpHost.postMessage(message);
}

function setStatus(status) {
  if (statusElement) {
    statusElement.textContent = status;
  }
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
      operationId: error.operationId,
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage
    };
  }

  return {
    message: String(error)
  };
}
