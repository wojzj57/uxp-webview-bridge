(function () {
  const RESULT_TYPE = "uxp-webview-bridge:test-result";
  const READY_TYPE = "uxp-webview-bridge:webview-ready";
  const RUN_TYPE = "uxp-webview-bridge:test-run";
  const webview = document.querySelector("webview");
  let bridgeRuntime;

  window.__UXP_BRIDGE_TEST_RESULT__ = {
    status: "idle",
    message: "No test has been run yet."
  };

  window.__UXP_BRIDGE_WEBVIEW_READY__ = false;
  window.__UXP_BRIDGE_TEST_CASES__ = [];
  window.__UXP_BRIDGE_TEST_DIAGNOSTICS__ = {
    bridgeConfigured: false,
    hasWebview: Boolean(webview)
  };

  try {
    const configUxpBridge = window.UxpWebviewBridgeUxp?.configUxpBridge;
    if (typeof configUxpBridge !== "function") {
      throw new Error("window.UxpWebviewBridgeUxp.configUxpBridge is not available.");
    }
    if (!webview) {
      throw new Error("No UXP webview element was found.");
    }

    bridgeRuntime = configUxpBridge({
      webview,
      capabilities: {
        fs: true
      }
    });
    window.__UXP_BRIDGE_TEST_DIAGNOSTICS__ = {
      ...window.__UXP_BRIDGE_TEST_DIAGNOSTICS__,
      bridgeConfigured: true
    };
  } catch (error) {
    window.__UXP_BRIDGE_TEST_DIAGNOSTICS__ = {
      ...window.__UXP_BRIDGE_TEST_DIAGNOSTICS__,
      bridgeConfigured: false,
      bridgeConfigError: error instanceof Error ? error.stack || error.message : String(error)
    };
  }

  window.addEventListener("unload", () => {
    bridgeRuntime?.destroy();
  });

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") {
      return;
    }

    if (data.type === READY_TYPE) {
      window.__UXP_BRIDGE_WEBVIEW_READY__ = true;
      window.__UXP_BRIDGE_TEST_CASES__ = Array.isArray(data.caseNames) ? data.caseNames : [];
      return;
    }

    if (data.type === RESULT_TYPE) {
      window.__UXP_BRIDGE_TEST_RESULT__ = data;
    }
  });

  window.__runUxpBridgeTest = function runUxpBridgeTest(caseName, payload) {
    if (!webview || typeof webview.postMessage !== "function") {
      window.__UXP_BRIDGE_TEST_RESULT__ = {
        type: RESULT_TYPE,
        status: "failed",
        caseName,
        error: "No UXP webview element with postMessage() was found."
      };
      return window.__UXP_BRIDGE_TEST_RESULT__;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.__UXP_BRIDGE_TEST_RESULT__ = {
      type: RESULT_TYPE,
      id,
      caseName,
      status: "running"
    };

    const testDiagnostics = {};
    if (caseName === "photoshop.public-shape") {
      try {
        testDiagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS__ = snapshotPhotoshopConstants();
      } catch (error) {
        testDiagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS_ERROR__ =
          error instanceof Error ? error.stack || error.message : String(error);
      }
    }

    webview.postMessage({
      type: RUN_TYPE,
      id,
      caseName,
      payload: payload || null,
      diagnostics: testDiagnostics
    });

    return window.__UXP_BRIDGE_TEST_RESULT__;
  };

  function snapshotPhotoshopConstants() {
    const nativeConstants = require("photoshop").constants;
    const snapshot = {};

    for (const enumName of Object.keys(nativeConstants).sort()) {
      const nativeEnum = nativeConstants[enumName];
      if (!nativeEnum || typeof nativeEnum !== "object") {
        continue;
      }
      const members = {};
      for (const memberName of Object.keys(nativeEnum).sort()) {
        // Numeric TypeScript enums expose reverse mappings such as `0: "NONE"`; callers and the
        // source declaration consume only the named forward members.
        if (/^(?:0|[1-9]\d*)$/.test(memberName)) {
          continue;
        }
        const value = nativeEnum[memberName];
        if (typeof value === "string" || typeof value === "number") {
          members[memberName] = value;
        }
      }
      snapshot[enumName] = members;
    }

    return snapshot;
  }
})();
