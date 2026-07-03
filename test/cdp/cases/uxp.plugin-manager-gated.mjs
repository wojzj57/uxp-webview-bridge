export default async function uxpPluginManagerGated({ bridge, assert }) {
  bridge.ensureConfigured();

  try {
    await bridge.uxp.pluginManager.plugins;
  } catch (error) {
    assert.equal(error.name, "BridgeRemoteError", "pluginManager gate should fail remotely.");
    assert.match(
      error.remoteMessage,
      /uxp pluginManager capability is disabled/,
      "remote message should mention pluginManager capability."
    );
    return {
      remoteName: error.remoteName,
      remoteMessage: error.remoteMessage
    };
  }

  throw new Error("uxp.pluginManager.plugins should be capability-gated by default.");
}
