import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REQUIRED_MULTI_WEBVIEW_CASES,
  createCompatibilityArtifact
} from "../runner/uxp-compatibility-artifact.mjs";

test("compatibility artifact consumes the real runner cases shape", () => {
  const passed = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: completeDiagnostics()
  }));

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases: passed });
  assert.equal(artifact.observedRows.length, 1);
  assert.equal(artifact.advertisedRows.length, 1);
  assert.equal(artifact.advertisedRows[0].evidence, "real-host-zero-skip");
  assert.equal(artifact.advertisedRows[0].diagnosticEvidence.listenerDeliveryCount, 2);
  assert.equal(artifact.advertisedRows[0].diagnosticEvidence.modalMaxConcurrency, 1);
});

test("compatibility artifact never advertises missing, skipped, or single-target evidence", () => {
  const incomplete = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: caseName.endsWith("navigation-generation") ? "skipped" : "passed",
    targets: { A: { status: "passed" } },
    diagnostics: { hostBridge: { versions: { host: "26.1" } } }
  }));

  const artifact = createCompatibilityArtifact({ status: "skipped", results: incomplete });
  assert.equal(artifact.observedRows.length, 1);
  assert.deepEqual(artifact.advertisedRows, []);
  assert.match(artifact.observedRows[0].releaseBlocker, /zero-skip dual-WebView/);
});

test("compatibility artifact rejects a zero-skip run with incomplete RFC diagnostics", () => {
  const cases = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: {
      hostBridge: {
        compatibility: { hostVersion: "26.1" },
        evidenceSource: "fixture-native-boundary"
      }
    }
  }));

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases });
  assert.deepEqual(artifact.advertisedRows, []);
  assert.match(artifact.observedRows[0].releaseBlocker, /diagnostics/i);
});

test("compatibility artifact rejects complete versions without required lifecycle evidence", () => {
  const cases = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: {
      hostBridge: {
        compatibility: completeDiagnostics().hostBridge.compatibility,
        evidenceSource: "fixture-native-boundary"
      }
    }
  }));

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases });
  assert.deepEqual(artifact.advertisedRows, []);
  assert.match(artifact.observedRows[0].releaseBlocker, /diagnostics/i);
});

test("compatibility artifact rejects lifecycle claims without fixture native-boundary evidence", () => {
  const cases = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: completeDiagnostics()
  }));
  for (const result of cases) delete result.diagnostics.hostBridge.evidenceSource;

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases });
  assert.deepEqual(artifact.advertisedRows, []);
  assert.match(artifact.observedRows[0].releaseBlocker, /Fixture-observed/i);
});

test("compatibility artifact rejects recursively leaked native call diagnostics", () => {
  const cases = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: completeDiagnostics()
  }));
  const resource = cases.find((result) => result.caseName === "bridge.multi-webview-resource-isolation");
  resource.diagnostics.hostBridge.nativeResources[0].nested = {
    descriptor: "native-descriptor-secret",
    metadata: { value: "plugin-data:/native-path-secret" }
  };
  const cleanup = cases.find((result) => result.caseName === "bridge.multi-webview-bounded-teardown");
  cleanup.diagnostics.hostBridge.cleanup.events[0].native = {
    documentID: 987654,
    notificationParameters: ["native-notification-secret"],
    navigation: { href: "plugin://uxp-webview-bridge-test/private-navigation" }
  };

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases });
  assert.deepEqual(artifact.advertisedRows, []);
  assert.match(artifact.observedRows[0].releaseBlocker, /minimized/i);
  const serializedArtifact = JSON.stringify(artifact);
  for (const sentinel of [
    "native-descriptor-secret",
    "plugin-data:/native-path-secret",
    "plugin://uxp-webview-bridge-test/private-navigation",
    "987654",
    "native-notification-secret"
  ]) {
    assert.equal(serializedArtifact.includes(sentinel), false, `artifact leaked ${sentinel}`);
  }
});

test("compatibility artifact rejects unknown compatibility placeholders", () => {
  const cases = REQUIRED_MULTI_WEBVIEW_CASES.map((caseName) => ({
    caseName,
    status: "passed",
    targets: completeTargets(),
    diagnostics: completeDiagnostics()
  }));
  cases[0].diagnostics.hostBridge.compatibility.hostVersion = "unknown";

  const artifact = createCompatibilityArtifact({ suiteName: "all", status: "passed", cases });
  assert.deepEqual(artifact.advertisedRows, []);
});

function completeDiagnostics() {
  return {
    hostBridge: {
      compatibility: {
        hostVersion: "26.1",
        photoshopVersion: "26.1",
        uxpVersion: "8.1",
        osVersion: "win32 10.0",
        packageVersion: "0.1.0",
        protocolVersion: "0.3.0",
        sourceIdentity: { A: true, B: true },
        generationMode: "load-barrier"
      },
      evidenceSource: "fixture-native-boundary",
      observedOrigins: ["plugin://uxp-webview-bridge-test"],
      dispatches: [
        { target: "A", bridgeSessionId: "session-a", operationId: "shared" },
        { target: "B", bridgeSessionId: "session-b", operationId: "shared" }
      ],
      owners: [
        { target: "A", bridgeSessionId: "session-a", state: "closed" },
        { target: "B", bridgeSessionId: "session-b", state: "active" }
      ],
      resources: [
        { target: "A", listenerDeliveries: 1, active: { fileHandle: 0 } },
        { target: "B", listenerDeliveries: 1, active: { fileHandle: 0 } }
      ],
      listeners: [{ target: "A", state: "added" }, { target: "B", state: "added" }],
      generations: [
        { target: "A", phase: "loadstart", generation: 1 },
        { target: "A", phase: "load", generation: 1 }
      ],
      modal: {
        queue: [{ target: "A", phase: "started" }, { target: "B", phase: "started" }],
        maxConcurrency: 1,
        nativeAttempts: [{}]
      },
      nativeResources: nativeResourceEvidence(),
      cleanup: {
        events: [
          { phase: "native-cleanup-held", observedAt: 1 },
          { phase: "default-deadline-elapsed", observedAt: 10_101, elapsedMs: 10_100 },
          { phase: "native-cleanup-completed", observedAt: 10_103 },
          { phase: "late-cleanup-released", observedAt: 10_104 }
        ],
        quarantines: [],
        replacementFences: [
          { code: "ERR_BRIDGE_OWNER_QUARANTINED", observedAt: 10_102 }
        ]
      }
    }
  };
}

function completeTargets() {
  return {
    A: { status: "passed", result: { ownerPrepared: true } },
    B: { status: "passed", result: { remainedLive: true, peerClosedByNavigation: true } }
  };
}

function nativeResourceEvidence() {
  const events = [];
  for (const kind of ["file-descriptor", "temporary-document", "image-data", "notification-listener"]) {
    events.push({ kind, phase: "created" }, { kind, phase: "created" });
    events.push({ kind, phase: "released" }, { kind, phase: "released" });
  }
  events.push(
    { kind: "notification-listener", phase: "delivered" },
    { kind: "notification-listener", phase: "delivered" }
  );
  return events;
}
