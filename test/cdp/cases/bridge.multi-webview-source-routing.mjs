export default async function multiWebviewSourceRouting({ target, bridge, assert, control, reportDiagnostics }) {
  const runtime = bridge.ensureConfigured();
  await runtime.ready;
  assert.nonEmptyString(runtime.bridgeSessionId, `${target} bridgeSessionId`);
  await control("barrier", { name: "source-routing-ready", value: runtime.bridgeSessionId });

  const operationId = "rfc25-reused-operation-id";
  const value = await bridge.rawCall(operationId, "uxp-api/modules/uxp", "versions.uxp", []);
  assert.nonEmptyString(value, `${target} routed UXP version`);
  const snapshot = await control("snapshot");
  const matching = snapshot.dispatches.filter((entry) => entry.operationId === operationId);
  assert.equal(matching.filter((entry) => entry.target === target).length, 1,
    `Host must dispatch ${target}'s reused operation id exactly once.`);
  reportDiagnostics({ operationId, bridgeSessionId: runtime.bridgeSessionId, dispatch: matching });
  return { target, bridgeSessionId: runtime.bridgeSessionId, operationId, value };
}
