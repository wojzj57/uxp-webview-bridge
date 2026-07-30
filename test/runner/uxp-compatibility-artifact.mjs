export const REQUIRED_MULTI_WEBVIEW_CASES = Object.freeze([
  "bridge.multi-webview-source-routing",
  "bridge.multi-webview-resource-isolation",
  "bridge.multi-webview-navigation-generation",
  "bridge.multi-webview-modal-ordering",
  "bridge.multi-webview-bounded-teardown"
]);

export function createCompatibilityArtifact(runResult) {
  const results = Array.isArray(runResult?.cases)
    ? runResult.cases
    : Array.isArray(runResult?.results) ? runResult.results : [runResult].filter(Boolean);
  const byName = new Map(results.map((result) => [result.caseName, result]));
  const requiredResults = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => byName.get(caseName));
  const compatibility = requiredResults.find((result) => result?.diagnostics?.hostBridge?.compatibility)
    ?.diagnostics.hostBridge.compatibility ?? {};
  const statusesComplete = requiredResults.every((result) =>
    result?.status === "passed" && result.targets?.A?.status === "passed" && result.targets?.B?.status === "passed"
  );
  const boundaryEvidenceComplete = requiredResults.every((result) =>
    result?.diagnostics?.hostBridge?.evidenceSource === "fixture-native-boundary"
  );
  const diagnosticsMinimized = requiredResults.every((result) => !containsSensitiveNativeDiagnostics({
    targets: result?.targets,
    diagnostics: result?.diagnostics
  }));
  const diagnosticsComplete = boundaryEvidenceComplete && requiredResults.every((result) =>
    hasRequiredDiagnostics(result?.diagnostics?.hostBridge?.compatibility)
  ) && hasRequiredLifecycleEvidence(byName);
  const complete = statusesComplete && diagnosticsComplete && diagnosticsMinimized;
  const row = {
    compatibility,
    diagnosticEvidence: summarizeLifecycleEvidence(byName),
    cases: Object.fromEntries(REQUIRED_MULTI_WEBVIEW_CASES.map((caseName, index) => [
      caseName,
      requiredResults[index]?.status ?? "not-run"
    ])),
    evidence: complete ? "real-host-zero-skip" : "observed-incomplete",
    ...(complete ? {} : {
      releaseBlocker: statusesComplete
        ? diagnosticsMinimized
          ? boundaryEvidenceComplete
            ? "Complete RFC-0025 compatibility diagnostics are required for every case."
            : "Fixture-observed public behavior and native-call boundary evidence is required."
          : "Fixture diagnostics must be minimized and exclude native call identities and arguments."
        : "A zero-skip dual-WebView result for every RFC-0025 case is required."
    })
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    requiredCases: REQUIRED_MULTI_WEBVIEW_CASES,
    observedRows: [row],
    advertisedRows: complete ? [row] : []
  };
}

function containsSensitiveNativeDiagnostics(value, path = []) {
  if (typeof value === "string") {
    if (path.at(-1)?.toLowerCase() === "observedorigins" && isOriginEvidence(value)) {
      return false;
    }
    return /^(?:https?:\/\/|file:\/|plugin(?:-data)?:\/)/i.test(value);
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsSensitiveNativeDiagnostics(entry, path));
  }
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const insideNativeResources = path.some((segment) => segment.toLowerCase() === "nativeresources");
    if ([
      "args",
      "arguments",
      "descriptor",
      "documentid",
      "filepath",
      "href",
      "imagedataid",
      "nativeargs",
      "nativearguments",
      "nativepath",
      "nativeurl",
      "notificationparameters",
      "notificationparams",
      "options",
      "path",
      "payload",
      "url"
    ].includes(normalizedKey) || (insideNativeResources && normalizedKey === "events")) {
      return true;
    }
    if (containsSensitiveNativeDiagnostics(entry, [...path, key])) return true;
  }
  return false;
}

function isOriginEvidence(value) {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+$/i.test(value);
}

function summarizeLifecycleEvidence(byName) {
  const host = (caseName) => byName.get(caseName)?.diagnostics?.hostBridge ?? {};
  const source = host("bridge.multi-webview-source-routing");
  const resource = host("bridge.multi-webview-resource-isolation");
  const navigation = host("bridge.multi-webview-navigation-generation");
  const modal = host("bridge.multi-webview-modal-ordering").modal ?? {};
  const cleanup = host("bridge.multi-webview-bounded-teardown");
  const nativeResources = resource.nativeResources ?? [];
  const cleanupEvents = cleanup.cleanup?.events ?? [];
  return {
    dispatchCount: source.dispatches?.length ?? 0,
    ownerCount: source.owners?.length ?? 0,
    resourceOwnerCount: new Set(nativeResources.filter((event) => event.phase === "created").map((event) => event.kind)).size,
    resourceCreatedCount: nativeResources.filter((event) => event.phase === "created").length,
    resourceReleasedCount: nativeResources.filter((event) => event.phase === "released").length,
    listenerDeliveryCount: nativeResources.filter((event) =>
      event.kind === "notification-listener" && event.phase === "delivered"
    ).length,
    generationEventCount: navigation.generations?.length ?? 0,
    modalQueueEventCount: modal.queue?.length ?? 0,
    modalMaxConcurrency: modal.maxConcurrency ?? 0,
    nativeModalAttemptCount: modal.nativeAttempts?.length ?? 0,
    cleanupDeadlineCount: cleanupEvents.filter((event) => event.phase === "default-deadline-elapsed").length,
    replacementFenceCount: cleanup.cleanup?.replacementFences?.length ?? 0
  };
}

function hasRequiredLifecycleEvidence(byName) {
  const host = (caseName) => byName.get(caseName)?.diagnostics?.hostBridge;
  const source = host("bridge.multi-webview-source-routing");
  const sourceDispatches = Array.isArray(source?.dispatches) ? source.dispatches : [];
  const sourceOwners = Array.isArray(source?.owners) ? source.owners : [];
  const sourceEvidence = ["A", "B"].every((target) =>
    sourceDispatches.some((entry) => entry?.target === target && typeof entry.bridgeSessionId === "string") &&
    sourceOwners.some((entry) => entry?.target === target && typeof entry.bridgeSessionId === "string")
  );

  const resourceResult = byName.get("bridge.multi-webview-resource-isolation");
  const nativeResources = host("bridge.multi-webview-resource-isolation")?.nativeResources ?? [];
  const resourceEvidence = ["file-descriptor", "temporary-document", "image-data", "notification-listener"]
    .every((kind) => {
      const created = nativeResources.filter((event) => event?.kind === kind && event.phase === "created").length;
      const released = nativeResources.filter((event) => event?.kind === kind && event.phase === "released").length;
      return created >= 2 && released === created;
    }) && nativeResources.filter((event) =>
      event?.kind === "notification-listener" && event.phase === "delivered"
    ).length >= 2 && resourceResult?.targets?.A?.result?.ownerPrepared === true &&
      resourceResult?.targets?.B?.result?.peerClosedByNavigation === true &&
      resourceResult?.targets?.B?.result?.remainedLive === true;

  const navigation = host("bridge.multi-webview-navigation-generation");
  const generations = Array.isArray(navigation?.generations) ? navigation.generations : [];
  const navigationEvidence = ["loadstart", "load"].every((phase) =>
    generations.some((entry) => entry?.target === "A" && entry.phase === phase)
  );

  const modal = host("bridge.multi-webview-modal-ordering")?.modal;
  const modalQueue = Array.isArray(modal?.queue) ? modal.queue : [];
  const modalEvidence = modal?.maxConcurrency === 1 &&
    ["A", "B"].every((target) => modalQueue.some((entry) => entry?.target === target && entry.phase === "started")) &&
    Array.isArray(modal?.nativeAttempts) && modal.nativeAttempts.length > 0;

  const cleanup = host("bridge.multi-webview-bounded-teardown");
  const cleanupEvents = cleanup?.cleanup?.events ?? [];
  const held = cleanupEvents.find((event) => event?.phase === "native-cleanup-held");
  const deadline = cleanupEvents.find((event) => event?.phase === "default-deadline-elapsed");
  const completed = cleanupEvents.find((event) => event?.phase === "native-cleanup-completed");
  const released = cleanupEvents.find((event) => event?.phase === "late-cleanup-released");
  const fence = cleanup?.cleanup?.replacementFences?.find((event) =>
    event?.code === "ERR_BRIDGE_OWNER_QUARANTINED"
  );
  const cleanupEvidence = held && deadline?.elapsedMs >= 10_000 && fence &&
    fence.observedAt >= deadline.observedAt && completed?.observedAt > fence.observedAt &&
    released?.observedAt >= completed.observedAt;

  return sourceEvidence && resourceEvidence && navigationEvidence && modalEvidence && cleanupEvidence;
}

function hasRequiredDiagnostics(value) {
  if (!value || typeof value !== "object") return false;
  for (const field of [
    "hostVersion",
    "photoshopVersion",
    "uxpVersion",
    "osVersion",
    "packageVersion",
    "protocolVersion",
    "generationMode"
  ]) {
    if (typeof value[field] !== "string" || value[field].length === 0 ||
      /^(unknown|n\/a|unavailable)$/i.test(value[field])) return false;
  }
  return value.sourceIdentity?.A === true && value.sourceIdentity?.B === true;
}
