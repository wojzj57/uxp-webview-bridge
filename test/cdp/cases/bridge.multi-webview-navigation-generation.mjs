export default async function navigationGeneration({ target, bridge, assert, control, reportDiagnostics }) {
  assert.equal(target, "B", "WebView B must coordinate WebView A's real navigation.");
  const runtime = bridge.ensureConfigured();
  const info = await runtime.ready;
  assert.equal(info.navigationReplacement, "supported");
  assert.equal(info.documentGenerationMode, "load-barrier");
  const bSession = runtime.bridgeSessionId;
  const noBridge = await control("navigateTargetNoBridge", { target: "A", nonce: `no-bridge-${Date.now()}` });
  assert.equal(noBridge.phase, "no-bridge-ready", "A must enter a real generation with no bridge runtime.");
  assert.nonEmptyString(noBridge.previousBridgeSessionId, "A old session before no-bridge generation");
  const lateOld = await control("probeLateOldSession", {
    target: "A",
    bridgeSessionId: noBridge.previousBridgeSessionId
  });
  assert.equal(lateOld.response, undefined,
    "A late call for the previous generation must be fenced without a response to the stale page.");
  assert.ok(lateOld.observedHostMessages.some((entry) => entry.type === "bridge.handshake.challenge"),
    "A pre-load hello must be deferred until the generation load barrier then challenged.");
  const navigation = await control("navigateTarget", { target: "A", nonce: `replacement-${Date.now()}` });
  assert.nonEmptyString(navigation.previousBridgeSessionId, "A previous session");
  assert.nonEmptyString(navigation.bridgeSessionId, "A replacement session");
  assert.ok(navigation.previousBridgeSessionId !== navigation.bridgeSessionId,
    "A real navigation must create a new bridge session.");
  assert.nonEmptyString(await bridge.os.platform(), "B remains routed during A navigation");
  const snapshot = await control("snapshot");
  const aGenerations = snapshot.generations.filter((entry) => entry.target === "A");
  assert.ok(aGenerations.some((entry) => entry.phase === "loadstart"), "A must emit a loadstart barrier.");
  assert.ok(aGenerations.some((entry) => entry.phase === "load"), "A must emit a load completion barrier.");
  assert.ok(aGenerations.filter((entry) => entry.phase === "loadstart").length >= 2,
    "A must begin both no-bridge and replacement generations.");
  assert.ok(aGenerations.filter((entry) => entry.phase === "load").length >= 2,
    "A must complete both no-bridge and replacement generation barriers.");
  reportDiagnostics({ noBridge, lateOld, navigation, aGenerations, coordinatorSession: bSession });
  return { target, bridgeSessionId: bSession, noBridge, lateOld, navigation, generationEvents: aGenerations };
}
