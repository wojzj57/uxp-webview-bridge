export default async function bridgePublicApiLoads({ bridge, assert }) {
  assert.ok(typeof bridge.ensureConfigured === "function", "bridge.ensureConfigured must be available.");
  assert.ok(typeof bridge.os.platform === "function", "os.platform must be available.");
  assert.ok(typeof bridge.fs.readFile === "function", "fs.readFile must be available.");
  assert.ok(typeof bridge.path.join === "function", "path.join must be available.");
  assert.ok(typeof bridge.uxp === "object", "uxp namespace must be available.");
  assert.ok(typeof bridge.uxp.pluginManager === "object", "uxp.pluginManager must be available.");
  assert.ok(typeof bridge.uxp.entrypoints === "object", "uxp.entrypoints must be available.");
  assert.ok(typeof bridge.uxp.storage.domains.userDocuments === "symbol", "uxp.storage.domains must be available.");
  assert.ok(typeof bridge.uxp.storage.localFileSystem.getFileForOpening === "function", "uxp.storage.localFileSystem shape must be available.");
  assert.ok(typeof bridge.photoshop === "object", "photoshop namespace must be available.");

  return {
    hasConfigWebviewBridge: true,
    hasOsPlatform: true,
    hasFsReadFile: true,
    hasPathJoin: true,
    hasUxp: true,
    hasUxpPluginManager: true,
    hasUxpEntrypoints: true,
    hasUxpStorageDomains: true,
    hasUxpLocalFileSystemShape: true,
    hasPhotoshop: true
  };
}
