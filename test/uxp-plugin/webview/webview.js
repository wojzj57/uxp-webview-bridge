import {
  clipboard,
  configWebviewBridge,
  crypto,
  fs,
  localStorage,
  os,
  path,
  photoshop,
  sessionStorage,
  uxp
} from "../dist/webview/index.js";
import { cases, caseTimeouts } from "./generated/case-registry.js";
import { startWebviewHarness } from "./readiness.js";

const READY_TYPE = "uxp-webview-bridge:webview-ready";
const RUN_TYPE = "uxp-webview-bridge:test-run";
const RESULT_TYPE = "uxp-webview-bridge:test-result";
const CONTROL_REQUEST_TYPE = "uxp-webview-bridge:test-control";
const CONTROL_RESPONSE_TYPE = "uxp-webview-bridge:test-control-result";
const BOUNDED_PREPARE_TYPE = "uxp-webview-bridge:bounded-prepare";
const BOUNDED_PREPARED_TYPE = "uxp-webview-bridge:bounded-prepared";
const SKIP_RESULT = Symbol("uxp-webview-bridge:skip-result");
const target = new URL(window.location.href).searchParams.get("target") || "unknown";

const statusElement = document.getElementById("status");
let bridgeRuntime;
const pendingControls = new Map();
const pendingRawCalls = new Map();
const webviewDiagnostics = {
  observedHostMessages: []
};

window.__UXP_BRIDGE_TEST_CASES__ = cases;

window.addEventListener("message", (event) => {
  const data = event.data;
  if (data && typeof data === "object") {
    webviewDiagnostics.observedHostMessages.push({
      type: typeof data.type === "string" ? data.type : "unknown",
      origin: event.origin,
      hasSource: Boolean(event.source),
      sourceMatchesUxpHost: event.source === window.uxpHost
    });
  }
  if (data?.type === CONTROL_RESPONSE_TYPE) {
    const pending = pendingControls.get(data.id);
    if (!pending) return;
    pendingControls.delete(data.id);
    data.error ? pending.reject(toControlError(data.error)) : pending.resolve(data.result);
    return;
  }
  if (data?.type === BOUNDED_PREPARE_TYPE) {
    void prepareBoundedTeardown(data);
    return;
  }
  if ((data?.type === "bridge.success" || data?.type === "bridge.error") &&
    pendingRawCalls.has(data.operationId)) {
    const pending = pendingRawCalls.get(data.operationId);
    pendingRawCalls.delete(data.operationId);
    data.type === "bridge.error" ? pending.reject(toControlError(data.error)) : pending.resolve(data.payload);
    return;
  }
  if (!data || typeof data !== "object" || data.type !== RUN_TYPE) {
    return;
  }

  void runCase(data);
});

async function prepareBoundedTeardown(request) {
  try {
    const runtime = ensureConfigured();
    await runtime.ready;
    const temporary = await photoshop.core.createTemporaryDocument({});
    postToHost({
      type: BOUNDED_PREPARED_TYPE,
      id: request.id,
      target,
      bridgeSessionId: runtime.bridgeSessionId,
      documentID: temporary.documentID
    });
  } catch (error) {
    postToHost({ type: BOUNDED_PREPARED_TYPE, id: request.id, target, error: normalizeError(error) });
  }
}

void startWebviewHarness({
  postReady(details) {
    postToHost({
      type: READY_TYPE,
      target,
      href: window.location.href,
      caseNames: Object.keys(cases),
      caseTimeouts,
      ...details
    });
  },
  async connect() {
    const runtime = ensureConfigured();
    const hostInfo = await runtime.ready;
    return {
      bridgeSessionId: runtime.bridgeSessionId,
      hostInfo
    };
  },
  normalizeError
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

    const reportedDiagnostics = {};
    const result = await testCase(createCaseContext(request, reportedDiagnostics));
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
      result,
      diagnostics: Object.keys(reportedDiagnostics).length > 0 ? reportedDiagnostics : undefined
    });
  } catch (error) {
    setStatus(`failed ${caseName}`);
    postResult({
      id: request.id,
      caseName,
      status: "failed",
      durationMs: Date.now() - startedAt,
      error: normalizeError(error),
      diagnostics: {
        ...request.diagnostics,
        webview: webviewDiagnostics
      }
    });
  }
}

function createCaseContext(request, reportedDiagnostics) {
  return {
    target,
    payload: request.payload ?? null,
    hostDiagnostics: request.diagnostics ?? {},
    control: (command, payload) => sendControl(request.id, command, payload),
    reportDiagnostics(diagnostics) {
      if (diagnostics && typeof diagnostics === "object") {
        Object.assign(reportedDiagnostics, diagnostics);
      }
    },
    bridge: {
      ensureConfigured,
      destroy: () => bridgeRuntime?.destroy(),
      rawCall,
      clipboard,
      crypto,
      fs,
      localStorage,
      os,
      path,
      photoshop,
      sessionStorage,
      uxp
    },
    assert: createAssert(),
    skip
  };
}

function ensureConfigured() {
  if (!bridgeRuntime || bridgeRuntime.state === "destroyed") {
    bridgeRuntime = configWebviewBridge({
      allowedOrigins: ["com.uxpwebviewbridge.test"]
    });
  }
  return bridgeRuntime;
}

function sendControl(runId, command, payload) {
  const id = `${target}-control-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    pendingControls.set(id, { resolve, reject });
    postToHost({ type: CONTROL_REQUEST_TYPE, id, runId, command, payload, target });
  });
}

async function rawCall(operationId, module, method, args = []) {
  const runtime = ensureConfigured();
  await runtime.ready;
  if (pendingRawCalls.has(operationId)) throw new Error(`Raw operation ${operationId} is already pending.`);
  return new Promise((resolve, reject) => {
    pendingRawCalls.set(operationId, { resolve, reject });
    postToHost({
      type: "bridge.call",
      bridgeSessionId: runtime.bridgeSessionId,
      operationId,
      payload: { module, method, args }
    });
  });
}

function toControlError(value) {
  const error = new Error(value?.remoteMessage || value?.message || String(value));
  if (value && typeof value === "object") Object.assign(error, value);
  return error;
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
    target,
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
