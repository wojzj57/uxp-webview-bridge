export default async function bridgeRemoteErrorShape({ bridge, assert }) {
  bridge.ensureConfigured();

  try {
    await bridge.fs.readFile("file:/uxp-webview-bridge-not-allowed.txt", { encoding: "utf-8" });
  } catch (error) {
    assert.equal(error.name, "BridgeRemoteError", "remote errors must use BridgeRemoteError.");
    assert.nonEmptyString(error.operationId, "BridgeRemoteError.operationId");
    assert.nonEmptyString(error.remoteMessage, "BridgeRemoteError.remoteMessage");
    assert.match(error.remoteMessage, /Unsupported fs path scheme/, "remote message should preserve host failure.");

    return {
      name: error.name,
      operationId: error.operationId,
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage
    };
  }

  throw new Error("Expected fs.readFile with file: scheme to fail.");
}
