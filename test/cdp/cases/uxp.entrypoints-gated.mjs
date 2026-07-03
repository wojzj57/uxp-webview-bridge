export default async function uxpEntrypointsGated({ bridge, assert }) {
  bridge.ensureConfigured();

  try {
    await bridge.uxp.entrypoints.getPanel("bridge-test-webview");
  } catch (error) {
    assert.equal(error.name, "BridgeRemoteError", "entrypoints gate should fail remotely.");
    assert.match(
      error.remoteMessage,
      /uxp entrypoints capability is disabled/,
      "remote message should mention entrypoints capability."
    );
    return {
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage
    };
  }

  throw new Error("uxp.entrypoints.getPanel should be capability-gated by default.");
}
