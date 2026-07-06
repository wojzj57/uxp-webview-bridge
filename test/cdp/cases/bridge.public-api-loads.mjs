export default async function bridgePublicApiLoads({ bridge, assert }) {
  assert.ok(typeof bridge.ensureConfigured === "function", "bridge.ensureConfigured must be available.");
  assert.ok(typeof bridge.fs.readFile === "function", "fs.readFile must be available.");
  assert.ok(typeof bridge.os.platform === "function", "os.platform must be available.");
  assert.ok(typeof bridge.path.join === "function", "path.join must be available.");
  assert.ok(typeof bridge.uxp === "object", "uxp namespace must be available.");
  assert.ok(typeof bridge.uxp.host === "object", "uxp.host must be available.");
  assert.ok(typeof bridge.uxp.pluginManager === "object", "uxp.pluginManager must be available.");
  assert.ok(typeof bridge.uxp.versions === "object", "uxp.versions must be available.");
  assert.ok(typeof bridge.uxp.shell === "object", "uxp.shell must be available.");
  assert.ok(typeof bridge.uxp.shell.openPath === "function", "uxp.shell.openPath must be available.");
  assert.ok(typeof bridge.uxp.shell.openExternal === "function", "uxp.shell.openExternal must be available.");
  assert.ok(typeof bridge.uxp.userInfo === "object", "uxp.userInfo must be available.");
  assert.ok(typeof bridge.uxp.userInfo.userId === "function", "uxp.userInfo.userId must be available.");

  return {
    hasConfigWebviewBridge: true,
    hasFsReadFile: true,
    hasOsPlatform: true,
    hasPathJoin: true,
    hasUxpHost: true,
    hasUxpPluginManager: true,
    hasUxpShell: true,
    hasUxpUserInfo: true,
    hasUxpVersions: true
  };
}
