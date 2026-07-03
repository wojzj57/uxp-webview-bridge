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

    bridgeRuntime = configUxpBridge({ webview });
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

    webview.postMessage({
      type: RUN_TYPE,
      id,
      caseName,
      payload: payload || null
    });

    return window.__UXP_BRIDGE_TEST_RESULT__;
  };
})();
