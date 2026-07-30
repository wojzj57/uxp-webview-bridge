export default async function boundedTeardown({ target, bridge, assert, control, reportDiagnostics }) {
  assert.equal(target, "B", "WebView B must coordinate teardown so WebView A can navigate away.");
  const runtime = bridge.ensureConfigured();
  await runtime.ready;
  const bSession = runtime.bridgeSessionId;

  const prepared = await control("prepareBoundedTeardown", { target: "A" });
  assert.nonEmptyString(prepared.bridgeSessionId, "A prepared Host session");
  assert.nonEmptyString(prepared.teardownToken, "A must create a real Host temporary document owner.");

  const noBridge = await control("navigateTargetNoBridge", {
    target: "A",
    nonce: `bounded-close-${Date.now()}`
  });
  assert.equal(noBridge.previousBridgeSessionId, prepared.bridgeSessionId,
    "Navigation must close the session that owns the held Host cleanup.");

  const deadline = await control("awaitDefaultCleanupDeadline", {
    teardownToken: prepared.teardownToken
  });
  assert.ok(deadline.elapsedMs >= 10_000,
    "The fixture must observe the real default drain and owner cleanup deadlines before claiming quarantine behavior.");
  assert.nonEmptyString(await bridge.os.platform(), "B remains live while A cleanup exceeds the default deadline");

  const fenced = await control("navigateTargetExpectBridgeFailure", {
    target: "A",
    nonce: `bounded-fence-${Date.now()}`
  });
  assert.equal(fenced.bridgeError?.code, "ERR_BRIDGE_OWNER_QUARANTINED",
    "An actual replacement attempt must be denied by the Host quarantine fence.");

  await control("releaseTemporaryDelete", { teardownToken: prepared.teardownToken });

  const replacement = await control("navigateTarget", {
    target: "A",
    nonce: `bounded-replacement-${Date.now()}`
  });
  assert.ok(replacement.bridgeSessionId !== prepared.bridgeSessionId,
    "A replacement session is allowed only after late cleanup finalizes.");
  assert.nonEmptyString(await bridge.os.platform(), "B remains live after A replacement");

  reportDiagnostics({
    evidenceSource: "fixture-native-boundary",
    cleanupDeadlineElapsedMs: deadline.elapsedMs,
    fencedBridgeSessionId: prepared.bridgeSessionId,
    replacementBridgeSessionId: replacement.bridgeSessionId
  });
  return {
    target,
    bridgeSessionId: bSession,
    remainedLive: true,
    fenceCode: fenced.bridgeError.code,
    targetA: {
      target: "A",
      bridgeSessionId: prepared.bridgeSessionId,
      replacementBridgeSessionId: replacement.bridgeSessionId,
      fenceCode: fenced.bridgeError.code
    }
  };
}
