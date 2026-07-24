export default async function bridgeRemoteErrorShape({ bridge, assert }) {
  bridge.ensureConfigured();

  try {
    await bridge.fs.readFile("");
  } catch (error) {
    assert.equal(error.name, "BridgeRemoteError", "remote errors must use BridgeRemoteError.");
    assert.nonEmptyString(error.operationId, "BridgeRemoteError.operationId");
    assert.nonEmptyString(error.remoteMessage, "BridgeRemoteError.remoteMessage");
    assert.match(
      error.remoteMessage,
      /fs\.readFile path must be a non-empty string/,
      "remote message should preserve host failure."
    );

    return {
      name: error.name,
      operationId: error.operationId,
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage
    };
  }

  throw new Error("Expected fs.readFile with an empty path to fail remotely.");
}
