(function () {
  const RESULT_TYPE = "uxp-webview-bridge:test-result";
  const READY_TYPE = "uxp-webview-bridge:webview-ready";
  const RUN_TYPE = "uxp-webview-bridge:test-run";
  const CONTROL_REQUEST_TYPE = "uxp-webview-bridge:test-control";
  const CONTROL_RESPONSE_TYPE = "uxp-webview-bridge:test-control-result";
  const NO_BRIDGE_CONTROL_TYPE = "uxp-webview-bridge:no-bridge-control";
  const NO_BRIDGE_RESULT_TYPE = "uxp-webview-bridge:no-bridge-result";
  const BOUNDED_PREPARE_TYPE = "uxp-webview-bridge:bounded-prepare";
  const BOUNDED_PREPARED_TYPE = "uxp-webview-bridge:bounded-prepared";
  const webviews = Array.from(document.querySelectorAll("webview"));
  const bridgeRuntimes = [];
  const readyTargets = new Map();
  const pendingRuns = new Map();
  const barriers = new Map();
  const pendingNavigations = new Map();
  const pendingNoBridgeProbes = new Map();
  const pendingBoundedPreparations = new Map();
  const heldTemporaryDeletes = new Map();
  let nextTemporaryDeleteToken = 0;
  let activeRunId;
  let externalModalCompletion;
  let modalHold;
  let forcedNativeBusyTarget;
  const diagnostics = {
    bridgeConfigured: false,
    hasWebview: webviews.length > 0,
    webviewCount: webviews.length,
    observedOrigins: [],
    dispatches: [],
    outbound: [],
    owners: [],
    listeners: [],
    nativeResources: [],
    generations: [],
    modal: {
      queue: [], active: 0, maxConcurrency: 0, nestedProvenance: 0,
      externalBusy: [], nativeAttempts: []
    },
    cleanup: { events: [], quarantines: [], replacementFences: [] },
    versions: readVersions(),
    targets: webviews.map((element, index) => ({
      target: targetName(index),
      id: element.id,
      sourceObserved: false,
      generation: 0,
      bridgeSessionId: undefined
    }))
  };

  window.__UXP_BRIDGE_TEST_RESULT__ = { status: "idle", message: "No test has been run yet." };
  window.__UXP_BRIDGE_WEBVIEW_READY__ = false;
  window.__UXP_BRIDGE_TEST_CASES__ = [];
  window.__UXP_BRIDGE_TEST_CASE_TIMEOUTS__ = {};
  window.__UXP_BRIDGE_TEST_DIAGNOSTICS__ = diagnostics;

  try {
    if (webviews.length !== 2) throw new Error(`Expected two UXP webview elements; found ${webviews.length}.`);
    installWebviewInstrumentation();
    installModalInstrumentation();
    installResourceInstrumentation();
    const configUxpBridge = window.UxpWebviewBridgeUxp?.configUxpBridge;
    if (typeof configUxpBridge !== "function") {
      throw new Error("window.UxpWebviewBridgeUxp.configUxpBridge is not available.");
    }
    const capabilities = [
      "clipboard", "crypto", "fs", "localStorage", "os", "path", "sessionStorage",
      "photoshop.dom", "photoshop.core", "photoshop.imaging", "photoshop.batchPlay",
      "uxp.host", "uxp.versions", "uxp.shell", "uxp.userInfo", "uxp.pluginManager",
      "uxp.storage.secureStorage", "uxp.storage.localFileSystem", "uxp.xmp"
    ];
    for (const element of webviews) {
      bridgeRuntimes.push(configUxpBridge({
        webview: element,
        capabilities,
        temporaryDocumentTimeoutMs: 60_000
      }));
    }
    diagnostics.bridgeConfigured = true;
  } catch (error) {
    diagnostics.bridgeConfigError = normalizeError(error);
  }

  window.addEventListener("unload", () => {
    for (const runtime of bridgeRuntimes) void runtime.destroy();
  });

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    const targetIndex = webviews.findIndex((element) => event.source === element);
    const target = targetName(targetIndex);
    if (targetIndex < 0) return;
    diagnostics.targets[targetIndex].sourceObserved = true;
    if (!diagnostics.observedOrigins.includes(event.origin)) diagnostics.observedOrigins.push(event.origin);
    observeInbound(target, data);

    if (data.type === NO_BRIDGE_RESULT_TYPE) {
      const pending = pendingNoBridgeProbes.get(data.id);
      if (!pending || pending.target !== target) return;
      pendingNoBridgeProbes.delete(data.id);
      pending.resolve(data);
      return;
    }
    if (data.type === BOUNDED_PREPARED_TYPE) {
      const pending = pendingBoundedPreparations.get(data.id);
      if (!pending || pending.target !== target) return;
      pendingBoundedPreparations.delete(data.id);
      if (data.error) pending.reject(data.error);
      else {
        const armed = armTemporaryDeleteHang(data.documentID);
        pending.resolve({
          target: data.target,
          bridgeSessionId: data.bridgeSessionId,
          teardownToken: armed.teardownToken
        });
      }
      return;
    }

    if (data.type === CONTROL_REQUEST_TYPE) {
      void handleControl(event.source, target, data);
      return;
    }
    if (data.type === READY_TYPE) {
      if (data.target !== target) return;
      readyTargets.set(target, data);
      if (data.phase === "bridge-ready" && typeof data.bridgeSessionId === "string") {
        diagnostics.targets[targetIndex].bridgeSessionId = data.bridgeSessionId;
        diagnostics.targets[targetIndex].generationMode = data.hostInfo?.documentGenerationMode;
        diagnostics.owners.push({ target, bridgeSessionId: data.bridgeSessionId, state: "active" });
      } else if (data.phase === "bridge-failed") {
        diagnostics.targets[targetIndex].bridgeError = data.bridgeError;
      }
      completeNavigation(target, data);
      publishReadyState();
      return;
    }
    if (data.type === RESULT_TYPE) receiveResult(target, data);
  });

  window.__runUxpBridgeTest = function runUxpBridgeTest(caseName, payload) {
    const targets = [
      "bridge.multi-webview-navigation-generation",
      "bridge.multi-webview-bounded-teardown"
    ].includes(caseName) ? ["B"] : ["A", "B"];
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeRunId = id;
    window.__UXP_BRIDGE_TEST_RESULT__ = { type: RESULT_TYPE, id, caseName, status: "running" };
    pendingRuns.set(id, { caseName, targets, results: new Map() });
    for (const target of targets) {
      const index = target === "A" ? 0 : 1;
      webviews[index].postMessage({
        type: RUN_TYPE,
        id,
        caseName,
        payload: { ...(payload || {}), target },
        diagnostics: { target, hostBridge: snapshotDiagnostics() }
      });
    }
    return window.__UXP_BRIDGE_TEST_RESULT__;
  };

  function receiveResult(target, data) {
    const run = pendingRuns.get(data.id);
    if (!run || !run.targets.includes(target) || data.target !== target) return;
    run.results.set(target, data);
    if (run.results.size !== run.targets.length) return;
    pendingRuns.delete(data.id);
    const targetResults = Object.fromEntries(run.results);
    if (run.caseName === "bridge.multi-webview-navigation-generation" && targetResults.B?.status === "passed") {
      targetResults.A = {
        type: RESULT_TYPE,
        id: data.id,
        caseName: run.caseName,
        target: "A",
        status: "passed",
        durationMs: targetResults.B.durationMs,
        result: {
          target: "A",
          bridgeSessionId: targetResults.B.result?.navigation?.bridgeSessionId,
          previousBridgeSessionId: targetResults.B.result?.navigation?.previousBridgeSessionId,
          navigated: true
        }
      };
    }
    if (run.caseName === "bridge.multi-webview-bounded-teardown" && targetResults.B?.status === "passed") {
      targetResults.A = {
        type: RESULT_TYPE,
        id: data.id,
        caseName: run.caseName,
        target: "A",
        status: "passed",
        durationMs: targetResults.B.durationMs,
        result: targetResults.B.result?.targetA
      };
    }
    const statuses = Object.values(targetResults).map((result) => result.status);
    const validationError = validateAggregate(run.caseName, targetResults, data.id);
    window.__UXP_BRIDGE_TEST_RESULT__ = {
      type: RESULT_TYPE,
      id: data.id,
      caseName: run.caseName,
      status: validationError || statuses.includes("failed")
        ? "failed"
        : statuses.includes("skipped") ? "skipped" : "passed",
      durationMs: Math.max(...Object.values(targetResults).map((result) => result.durationMs || 0)),
      targets: targetResults,
      ...(validationError ? { error: validationError } : {}),
      diagnostics: { hostBridge: snapshotDiagnostics(data.id) }
    };
  }

  function validateAggregate(caseName, results, runId) {
    if (results.A?.result?.bridgeSessionId &&
      results.A.result.bridgeSessionId === results.B?.result?.bridgeSessionId) {
      return "WebView A and B reported the same bridgeSessionId.";
    }
    if (caseName === "bridge.multi-webview-source-routing") {
      const calls = diagnostics.dispatches.filter((entry) => entry.operationId === "rfc25-reused-operation-id");
      if (calls.length !== 2 || new Set(calls.map((entry) => entry.target)).size !== 2 ||
        new Set(calls.map((entry) => entry.bridgeSessionId)).size !== 2) {
        return "Reused operation id was not dispatched exactly once to each source-owned session.";
      }
    }
    if (caseName === "bridge.multi-webview-modal-ordering" && diagnostics.modal.maxConcurrency !== 1) {
      return `Expected native modal max concurrency 1; observed ${diagnostics.modal.maxConcurrency}.`;
    }
    if (caseName === "bridge.multi-webview-resource-isolation") {
      if (!hasReleasedNativeResources(nativeResourceEvents(runId), results)) {
        return "Fixture-observed native calls do not prove the required resource lifecycle.";
      }
    }
    if (caseName === "bridge.multi-webview-navigation-generation") {
      const starts = diagnostics.generations.filter((entry) => entry.target === "A" && entry.phase === "loadstart");
      const loads = diagnostics.generations.filter((entry) => entry.target === "A" && entry.phase === "load");
      if (starts.length < 2 || loads.length < 2 || results.B?.result?.lateOld?.response !== undefined) {
        return "Navigation evidence must include no-bridge and replacement load barriers with a fenced late-old call.";
      }
    }
    if (caseName === "bridge.multi-webview-modal-ordering") {
      const busyOperationId = results.A?.result?.busyOutcome?.operationId;
      const attempts = diagnostics.modal.nativeAttempts.filter((entry) => entry.operationId === busyOperationId);
      const fifoOperationIds = new Set(diagnostics.modal.nativeAttempts
        .filter((entry) => /FIFO/.test(entry.commandName || ""))
        .map((entry) => entry.operationId));
      const fifoStarts = diagnostics.modal.queue.filter((entry) =>
        entry.phase === "started" && fifoOperationIds.has(entry.operationId)
      );
      if (attempts.length !== 1 || fifoStarts[0]?.target !== "A" || fifoStarts[1]?.target !== "B") {
        return "Modal evidence must prove A-to-B FIFO and exactly one native attempt for busy rejection.";
      }
    }
    if (caseName === "bridge.multi-webview-bounded-teardown") {
      if (!hasActualBoundedLifecycle(runId) ||
        results.A?.result?.fenceCode !== "ERR_BRIDGE_OWNER_QUARANTINED") {
        return "Bounded teardown must cross the default deadline and expose a real replacement fence and late cleanup.";
      }
    }
    return undefined;
  }

  async function handleControl(source, target, request) {
    try {
      let result;
      if (request.command === "barrier") {
        await enterBarrier(source, target, request);
        return;
      } else if (request.command === "snapshot") {
        result = snapshotDiagnostics(request.runId);
      } else if (request.command === "navigateTarget") {
        result = await navigateTarget(request.payload?.target || "A", request.payload?.nonce);
      } else if (request.command === "navigateTargetNoBridge") {
        result = await navigateTargetNoBridge(request.payload?.target || "A", request.payload?.nonce);
      } else if (request.command === "navigateTargetExpectBridgeFailure") {
        result = await navigateTargetExpectBridgeFailure(request.payload?.target || "A", request.payload?.nonce);
      } else if (request.command === "probeLateOldSession") {
        result = await probeLateOldSession(request.payload?.target || "A", request.payload?.bridgeSessionId);
      } else if (request.command === "prepareBoundedTeardown") {
        result = await prepareBoundedTeardown(request.payload?.target || "A");
      } else if (request.command === "awaitDefaultCleanupDeadline") {
        result = await awaitDefaultCleanupDeadline(request.payload?.teardownToken, request.runId);
      } else if (request.command === "awaitNativeResourceRelease") {
        result = await awaitNativeResourceRelease(request.runId);
      } else if (request.command === "armTemporaryDeleteHang") {
        result = armTemporaryDeleteHang(request.payload?.documentID);
      } else if (request.command === "releaseTemporaryDelete") {
        result = await releaseTemporaryDelete(request.payload?.teardownToken);
      } else if (request.command === "startExternalModalBusy") {
        result = await startExternalModalBusy(request.payload?.durationMs || 150);
      } else if (request.command === "awaitExternalModalBusy") {
        result = await externalModalCompletion;
      } else if (request.command === "armNativeBusyRejection") {
        forcedNativeBusyTarget = request.payload?.target;
        result = { target: forcedNativeBusyTarget, armed: true };
      } else if (request.command === "armModalHold") {
        result = armModalHold(request.payload?.target);
      } else if (request.command === "awaitModalHeld") {
        result = await modalHold?.started;
      } else if (request.command === "releaseModalHold") {
        result = releaseModalHold();
      } else {
        throw new Error(`Unknown test control command: ${request.command}`);
      }
      respondControl(source, request.id, result);
    } catch (error) {
      respondControl(source, request.id, undefined, normalizeError(error));
    }
  }

  function enterBarrier(source, target, request) {
    const name = request.payload?.name || "default";
    const key = `${request.runId}:${name}`;
    const barrier = barriers.get(key) || [];
    barrier.push({ source, target, id: request.id, value: request.payload?.value });
    barriers.set(key, barrier);
    if (barrier.length < 2) return new Promise(() => undefined);
    barriers.delete(key);
    const values = Object.fromEntries(barrier.map((entry) => [entry.target, entry.value]));
    for (const entry of barrier) respondControl(entry.source, entry.id, { name, values });
    return Promise.resolve();
  }

  function navigateTarget(target, nonce) {
    const index = target === "A" ? 0 : 1;
    const element = webviews[index];
    const before = readyTargets.get(target);
    readyTargets.delete(target);
    window.__UXP_BRIDGE_WEBVIEW_READY__ = false;
    return new Promise((resolve, reject) => {
      pendingNavigations.set(target, {
        before,
        previousBridgeSessionId: diagnostics.targets[index].bridgeSessionId,
        expectedPhase: "bridge-ready",
        resolve,
        reject
      });
      const suffix = encodeURIComponent(nonce || `${Date.now()}`);
      element.setAttribute("src", `plugin:/webview/index.html?target=${target}&navigation=${suffix}`);
    });
  }

  function navigateTargetNoBridge(target, nonce) {
    const index = target === "A" ? 0 : 1;
    const element = webviews[index];
    const before = readyTargets.get(target);
    readyTargets.delete(target);
    window.__UXP_BRIDGE_WEBVIEW_READY__ = false;
    return new Promise((resolve, reject) => {
      pendingNavigations.set(target, {
        before,
        previousBridgeSessionId: diagnostics.targets[index].bridgeSessionId,
        expectedPhase: "no-bridge-ready",
        resolve,
        reject
      });
      const suffix = encodeURIComponent(nonce || `${Date.now()}`);
      element.setAttribute("src", `plugin:/webview/no-bridge.html?target=${target}&navigation=${suffix}`);
    });
  }

  function navigateTargetExpectBridgeFailure(target, nonce) {
    const index = target === "A" ? 0 : 1;
    const element = webviews[index];
    const before = readyTargets.get(target);
    readyTargets.delete(target);
    window.__UXP_BRIDGE_WEBVIEW_READY__ = false;
    return new Promise((resolve, reject) => {
      pendingNavigations.set(target, {
        before,
        previousBridgeSessionId: diagnostics.targets[index].bridgeSessionId,
        expectedPhase: "bridge-failed",
        resolve,
        reject
      });
      const suffix = encodeURIComponent(nonce || `${Date.now()}`);
      element.setAttribute("src", `plugin:/webview/index.html?target=${target}&fenced=${suffix}`);
    });
  }

  function prepareBoundedTeardown(target) {
    const index = target === "A" ? 0 : 1;
    const id = `${target}-bounded-prepare-${Date.now()}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingBoundedPreparations.delete(id);
        reject(new Error("Timed out preparing the bounded teardown target."));
      }, 5_000);
      pendingBoundedPreparations.set(id, {
        target,
        resolve(value) { clearTimeout(timeout); resolve(value); },
        reject(error) { clearTimeout(timeout); reject(error); }
      });
      webviews[index].postMessage({ type: BOUNDED_PREPARE_TYPE, id });
    });
  }

  async function awaitDefaultCleanupDeadline(teardownToken, runId) {
    const waitForHeldUntil = Date.now() + 5_000;
    let held;
    while (Date.now() < waitForHeldUntil) {
      held = findHeldTemporaryDelete(teardownToken);
      if (held?.startedAt) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!held?.startedAt) throw new Error("Native cleanup did not reach the fixture hold.");
    const requiredElapsedMs = 10_100;
    const remaining = requiredElapsedMs - (Date.now() - held.startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    const event = {
      runId,
      phase: "default-deadline-elapsed",
      observedAt: Date.now(),
      elapsedMs: Date.now() - held.startedAt
    };
    diagnostics.cleanup.events.push(event);
    return event;
  }

  async function awaitNativeResourceRelease(runId) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const events = nativeResourceEvents(runId);
      const complete = ["file-descriptor", "temporary-document", "image-data", "notification-listener"]
        .every((kind) => {
          const created = events.filter((event) => event.kind === kind && event.phase === "created").length;
          const released = events.filter((event) => event.kind === kind && event.phase === "released").length;
          return created >= 2 && released === created;
        });
      if (complete) return {
        evidenceSource: "fixture-native-boundary",
        events: events.map((event) => ({
          sequence: event.sequence,
          observedAt: event.observedAt,
          kind: event.kind,
          phase: event.phase
        }))
      };
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Timed out waiting for fixture-observed native resource release calls.");
  }

  function probeLateOldSession(target, bridgeSessionId) {
    if (typeof bridgeSessionId !== "string") throw new Error("The old Bridge session id is required.");
    const index = target === "A" ? 0 : 1;
    const id = `${target}-late-old-${Date.now()}`;
    const operationId = `${id}-operation`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingNoBridgeProbes.delete(id);
        reject(new Error("No-Bridge stale-session probe timed out."));
      }, 2_000);
      pendingNoBridgeProbes.set(id, {
        target,
        resolve(value) { clearTimeout(timeout); resolve(value); }
      });
      webviews[index].postMessage({ type: NO_BRIDGE_CONTROL_TYPE, id, bridgeSessionId, operationId });
    });
  }

  function completeNavigation(target, ready) {
    const pending = pendingNavigations.get(target);
    if (!pending) return;
    if (ready.phase !== pending.expectedPhase) return;
    if (ready.phase === "no-bridge-ready") {
      pending.ready = ready;
      if (pending.loadCompleted) finishNavigation(target, ready);
      return;
    }
    finishNavigation(target, ready);
  }

  function finishNavigation(target, ready) {
    const pending = pendingNavigations.get(target);
    if (!pending) return;
    if (ready.phase === "bridge-ready" && pending.previousBridgeSessionId === ready.bridgeSessionId) {
      pending.reject(new Error("Navigation reused the previous bridge session."));
      pendingNavigations.delete(target);
      return;
    }
    pendingNavigations.delete(target);
    pending.resolve({
      target,
      previousBridgeSessionId: pending.previousBridgeSessionId,
      bridgeSessionId: ready.bridgeSessionId,
      clientInstanceId: ready.clientInstanceId,
      phase: ready.phase,
      bridgeError: ready.bridgeError,
      documentGeneration: ready.hostInfo?.documentGeneration
    });
  }

  function installWebviewInstrumentation() {
    webviews.forEach((element, index) => {
      const target = targetName(index);
      element.addEventListener?.("loadstart", () => {
        diagnostics.targets[index].generation += 1;
        diagnostics.generations.push({ target, phase: "loadstart", generation: diagnostics.targets[index].generation });
      });
      element.addEventListener?.("load", () => {
        diagnostics.generations.push({ target, phase: "load", generation: diagnostics.targets[index].generation });
        const pending = pendingNavigations.get(target);
        if (pending?.expectedPhase === "no-bridge-ready") {
          pending.loadCompleted = true;
          if (pending.ready) finishNavigation(target, pending.ready);
        }
      });
    });
  }

  function observeInbound(target, message) {
    if (message.type === "bridge.call") {
      const entry = {
        target,
        bridgeSessionId: message.bridgeSessionId,
        operationId: message.operationId,
        module: message.payload?.module,
        method: message.payload?.method,
        modalContext: message.modalContext
      };
      diagnostics.dispatches.push(entry);
      if (message.modalContext) diagnostics.modal.nestedProvenance += 1;
      if (message.payload?.method === "core.executeAsModal") diagnostics.modal.queue.push({
        ...entry,
        phase: "queued",
        sequence: diagnostics.modal.queue.length
      });
      if (/addNotificationListener$/.test(message.payload?.method || "")) {
        diagnostics.listeners.push({ target, bridgeSessionId: message.bridgeSessionId, state: "added" });
      }
      if (/removeNotificationListener$/.test(message.payload?.method || "")) {
        diagnostics.listeners.push({ target, bridgeSessionId: message.bridgeSessionId, state: "removed" });
      }
    }
    if (message.type === "bridge.handshake.cancel") {
      diagnostics.cleanup.events.push({ target, bridgeSessionId: message.bridgeSessionId, phase: "cancel" });
    }
  }

  function observeOutbound(target, message) {
    if (!message || typeof message !== "object") return;
    diagnostics.outbound.push({
      target,
      type: message.type,
      bridgeSessionId: message.bridgeSessionId,
      operationId: message.operationId,
      code: message.error?.code,
      documentGeneration: message.documentGeneration
    });
    if (message.type === "bridge.handshake.error" && message.error?.code === "ERR_BRIDGE_OWNER_QUARANTINED") {
      diagnostics.cleanup.replacementFences.push({
        runId: activeRunId,
        target,
        code: message.error.code,
        observedAt: Date.now()
      });
    }
    if (message.type === "bridge.handshake.cancelled" && message.cleanup === "quarantined") {
      diagnostics.cleanup.quarantines.push({
        runId: activeRunId,
        target,
        bridgeSessionId: message.bridgeSessionId,
        observedAt: Date.now()
      });
    }
  }

  function installResourceInstrumentation() {
    try {
      const fs = require("fs");
      const nativeOpen = fs.open.bind(fs);
      const nativeClose = fs.close.bind(fs);
      fs.open = async (...args) => {
        const descriptor = await nativeOpen(...args);
        recordNativeResource("file-descriptor", "created");
        return descriptor;
      };
      fs.close = async (descriptor, ...args) => {
        const result = await nativeClose(descriptor, ...args);
        recordNativeResource("file-descriptor", "released");
        return result;
      };

      const photoshop = require("photoshop");
      const core = photoshop.core;
      const nativeCreateTemporaryDocument = core.createTemporaryDocument.bind(core);
      const nativeDeleteTemporaryDocument = core.deleteTemporaryDocument.bind(core);
      core.createTemporaryDocument = async (...args) => {
        const result = await nativeCreateTemporaryDocument(...args);
        recordNativeResource("temporary-document", "created");
        return result;
      };
      core.deleteTemporaryDocument = (options) => {
        const documentID = options?.documentID;
        const held = heldTemporaryDeletes.get(documentID);
        if (!held) {
          return Promise.resolve(nativeDeleteTemporaryDocument(options)).then((result) => {
            recordNativeResource("temporary-document", "released");
            return result;
          });
        }
        if (!held.startedAt) {
          held.startedAt = Date.now();
          diagnostics.cleanup.events.push({
            runId: activeRunId,
            phase: "native-cleanup-held",
            observedAt: held.startedAt
          });
        }
        if (!held.deletion) {
          held.deletion = held.promise
            .then(() => nativeDeleteTemporaryDocument(options))
            .then((result) => {
              recordNativeResource("temporary-document", "released");
              diagnostics.cleanup.events.push({
                runId: activeRunId,
                phase: "native-cleanup-completed",
                observedAt: Date.now()
              });
              return result;
            });
        }
        return held.deletion;
      };

      const action = photoshop.action;
      const nativeAddNotificationListener = action.addNotificationListener.bind(action);
      const nativeRemoveNotificationListener = action.removeNotificationListener.bind(action);
      const nativeListeners = new WeakMap();
      action.addNotificationListener = async (events, listener) => {
        const observedListener = (...args) => {
          recordNativeResource("notification-listener", "delivered");
          return listener(...args);
        };
        nativeListeners.set(listener, observedListener);
        const result = await nativeAddNotificationListener(events, observedListener);
        recordNativeResource("notification-listener", "created");
        return result;
      };
      action.removeNotificationListener = async (events, listener) => {
        const observedListener = nativeListeners.get(listener) || listener;
        const result = await nativeRemoveNotificationListener(events, observedListener);
        nativeListeners.delete(listener);
        recordNativeResource("notification-listener", "released");
        return result;
      };

      const imaging = photoshop.imaging;
      const nativeCreateImageData = imaging.createImageDataFromBuffer.bind(imaging);
      imaging.createImageDataFromBuffer = async (...args) => {
        const imageData = await nativeCreateImageData(...args);
        const nativeDispose = imageData.dispose.bind(imageData);
        imageData.dispose = async (...disposeArgs) => {
          const result = await nativeDispose(...disposeArgs);
          recordNativeResource("image-data", "released");
          return result;
        };
        recordNativeResource("image-data", "created");
        return imageData;
      };
      diagnostics.nativeResourceInstrumentation = "installed";
    } catch (error) {
      diagnostics.nativeResourceInstrumentationError = normalizeError(error);
    }
  }

  function recordNativeResource(kind, phase) {
    diagnostics.nativeResources.push({
      runId: activeRunId,
      sequence: diagnostics.nativeResources.length + 1,
      observedAt: Date.now(),
      kind,
      phase
    });
  }

  function nativeResourceEvents(runId) {
    return diagnostics.nativeResources.filter((event) => event.runId === runId);
  }

  function installModalInstrumentation() {
    try {
      const core = require("photoshop").core;
      const nativeExecuteAsModal = core.executeAsModal.bind(core);
      core.executeAsModal = async (callback, options) => {
        const startedOperations = new Set(diagnostics.modal.queue
          .filter((entry) => entry.phase === "started")
          .map((entry) => entry.operationId));
        const queued = diagnostics.modal.queue.find((entry) =>
          entry.phase === "queued" && !startedOperations.has(entry.operationId)
        );
        if (queued) diagnostics.modal.queue.push({ ...queued, phase: "started", sequence: diagnostics.modal.queue.length });
        const hold = modalHold && queued?.target === modalHold.target ? modalHold : undefined;
        const attempt = {
          target: queued?.target,
          operationId: queued?.operationId,
          commandName: options?.commandName,
          attempt: diagnostics.modal.nativeAttempts.filter((entry) => entry.operationId === queued?.operationId).length + 1
        };
        diagnostics.modal.nativeAttempts.push(attempt);
        diagnostics.modal.active += 1;
        diagnostics.modal.maxConcurrency = Math.max(diagnostics.modal.maxConcurrency, diagnostics.modal.active);
        try {
          if (forcedNativeBusyTarget && queued?.target === forcedNativeBusyTarget) {
            forcedNativeBusyTarget = undefined;
            const busyError = new Error("Injected native executeAsModal busy rejection for no-retry verification.");
            busyError.code = "ERR_NATIVE_MODAL_BUSY";
            throw busyError;
          }
          return await nativeExecuteAsModal(async (...args) => {
            try {
              return await callback(...args);
            } finally {
              if (hold) {
                diagnostics.modal.queue.push({ target: hold.target, phase: "native-held" });
                hold.markStarted();
                await hold.release;
              }
            }
          }, options);
        } finally {
          diagnostics.modal.active -= 1;
          if (queued) diagnostics.modal.queue.push({
            ...queued,
            phase: "completed",
            sequence: diagnostics.modal.queue.length
          });
        }
      };
      diagnostics.modal.instrumented = true;
      diagnostics.modal.nativeExecuteAsModal = nativeExecuteAsModal;
    } catch (error) {
      diagnostics.modal.instrumentationError = normalizeError(error);
    }
  }

  function armModalHold(target) {
    let markStarted;
    let release;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const releasePromise = new Promise((resolve) => { release = resolve; });
    modalHold = { target, started, markStarted, release: releasePromise, resolveRelease: release };
    return { target, armed: true };
  }

  function releaseModalHold() {
    if (!modalHold) throw new Error("No Bridge modal hold is armed.");
    const target = modalHold.target;
    modalHold.resolveRelease();
    modalHold = undefined;
    diagnostics.modal.queue.push({ target, phase: "native-hold-released" });
    return { target, released: true };
  }

  async function startExternalModalBusy(durationMs) {
    const native = diagnostics.modal.nativeExecuteAsModal;
    if (typeof native !== "function") throw new Error("Native executeAsModal instrumentation is unavailable.");
    let entered;
    const enteredPromise = new Promise((resolve) => { entered = resolve; });
    const event = { phase: "queued", durationMs };
    diagnostics.modal.externalBusy.push(event);
    externalModalCompletion = native(async () => {
      event.phase = "started";
      entered();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
    }, {
      commandName: "UXP bridge external modal busy fixture"
    }).then(() => {
      event.phase = "completed";
      return { durationMs, completed: true };
    }, (error) => {
      event.phase = "rejected";
      throw error;
    });
    await enteredPromise;
    return { durationMs, started: true };
  }

  function armTemporaryDeleteHang(documentID) {
    if (!Number.isInteger(documentID)) throw new Error("A temporary document id is required.");
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    const teardownToken = `temporary-delete-${++nextTemporaryDeleteToken}`;
    heldTemporaryDeletes.set(documentID, { documentID, teardownToken, promise, release });
    return { teardownToken, armed: true };
  }

  async function releaseTemporaryDelete(teardownToken) {
    const held = findHeldTemporaryDelete(teardownToken);
    if (!held) throw new Error("No held temporary delete exists for the teardown token.");
    held.release();
    await held.deletion;
    diagnostics.cleanup.events.push({
      runId: activeRunId,
      phase: "late-cleanup-released",
      observedAt: Date.now()
    });
    heldTemporaryDeletes.delete(held.documentID);
    return { released: true };
  }

  function findHeldTemporaryDelete(teardownToken) {
    if (typeof teardownToken !== "string") return undefined;
    return [...heldTemporaryDeletes.values()].find((held) => held.teardownToken === teardownToken);
  }

  function publishReadyState() {
    if (readyTargets.size !== webviews.length) return;
    const values = [...readyTargets.values()];
    const caseLists = values.map((ready) => Array.isArray(ready.caseNames) ? ready.caseNames : []);
    window.__UXP_BRIDGE_WEBVIEW_READY__ = true;
    window.__UXP_BRIDGE_TEST_CASES__ = caseLists[0].filter((name) => caseLists.every((list) => list.includes(name)));
    window.__UXP_BRIDGE_TEST_CASE_TIMEOUTS__ = Object.assign({}, ...values.map((ready) => ready.caseTimeouts || {}));
  }

  function respondControl(source, id, result, error) {
    source.postMessage({ type: CONTROL_RESPONSE_TYPE, id, result, error });
  }

  function snapshotDiagnostics(runId) {
    diagnostics.compatibility = createCompatibilityDiagnostics();
    const snapshot = JSON.parse(JSON.stringify(diagnostics));
    delete snapshot.modal.nativeExecuteAsModal;
    snapshot.evidenceSource = "fixture-native-boundary";
    snapshot.nativeResources = selectRunEvents(snapshot.nativeResources, runId).map((event) => ({
      sequence: event.sequence,
      observedAt: event.observedAt,
      kind: event.kind,
      phase: event.phase
    }));
    snapshot.cleanup.events = selectRunEvents(snapshot.cleanup.events, runId).map((event) => ({
      phase: event.phase,
      observedAt: event.observedAt,
      ...(typeof event.elapsedMs === "number" ? { elapsedMs: event.elapsedMs } : {})
    }));
    snapshot.cleanup.quarantines = selectRunEvents(snapshot.cleanup.quarantines, runId).map((event) => ({
      target: event.target,
      bridgeSessionId: event.bridgeSessionId,
      observedAt: event.observedAt
    }));
    snapshot.cleanup.replacementFences = selectRunEvents(snapshot.cleanup.replacementFences, runId).map((event) => ({
      target: event.target,
      code: event.code,
      observedAt: event.observedAt
    }));
    return snapshot;
  }

  function selectRunEvents(events, runId) {
    return runId ? events.filter((event) => event.runId === runId) : events;
  }

  function hasReleasedNativeResources(events, results) {
    const complete = ["file-descriptor", "temporary-document", "image-data", "notification-listener"]
      .every((kind) => {
        const created = events.filter((event) => event.kind === kind && event.phase === "created").length;
        const released = events.filter((event) => event.kind === kind && event.phase === "released").length;
        return created >= 2 && released === created;
      });
    const delivered = events.filter((event) =>
      event.kind === "notification-listener" && event.phase === "delivered"
    ).length;
    return complete && delivered >= 2 && results.A?.result?.ownerPrepared === true &&
      results.B?.result?.peerClosedByNavigation === true && results.B?.result?.remainedLive === true &&
      results.B?.result?.resourcesVerified === 5;
  }

  function hasActualBoundedLifecycle(runId) {
    const events = diagnostics.cleanup.events.filter((event) => event.runId === runId);
    const held = events.find((event) => event.phase === "native-cleanup-held");
    const deadline = events.find((event) => event.phase === "default-deadline-elapsed");
    const completed = events.find((event) => event.phase === "native-cleanup-completed");
    const released = events.find((event) => event.phase === "late-cleanup-released");
    const fence = diagnostics.cleanup.replacementFences.find((event) => event.runId === runId);
    return held && deadline?.elapsedMs >= 10_000 && fence?.code === "ERR_BRIDGE_OWNER_QUARANTINED" &&
      fence.observedAt >= deadline.observedAt && completed?.observedAt > fence.observedAt &&
      released?.observedAt >= completed.observedAt;
  }

  function createCompatibilityDiagnostics() {
    const metadata = window.__UXP_BRIDGE_TEST_RUNTIME_METADATA__ || {};
    return {
      hostVersion: diagnostics.versions.host,
      photoshopVersion: diagnostics.versions.photoshop,
      uxpVersion: diagnostics.versions.uxp,
      osVersion: diagnostics.versions.os,
      packageVersion: metadata.packageVersion,
      protocolVersion: metadata.protocolVersion,
      sourceIdentity: Object.fromEntries(diagnostics.targets.map((entry) => [entry.target, entry.sourceObserved === true])),
      generationMode: diagnostics.targets.find((entry) => entry.generationMode)?.generationMode
    };
  }

  function readVersions() {
    try {
      const photoshop = require("photoshop");
      const uxp = require("uxp");
      const os = require("os");
      return {
        host: String(uxp.host?.version || photoshop.app?.version || "unknown"),
        hostName: String(uxp.host?.name || "Photoshop"),
        photoshop: String(photoshop.app?.version || "unknown"),
        uxp: String(uxp.versions?.uxp || uxp.versions?.runtime || "unknown"),
        os: `${os.platform?.() || "unknown"} ${os.release?.() || "unknown"}`
      };
    } catch (error) {
      return { error: normalizeError(error) };
    }
  }

  function targetName(index) {
    return index === 0 ? "A" : index === 1 ? "B" : undefined;
  }

  function normalizeError(error) {
    return error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack, code: error.code }
      : { message: String(error) };
  }
})();
