export default async function bridgePublicApiLoads({ bridge, assert }) {
  assert.ok(typeof bridge.ensureConfigured === "function", "bridge.ensureConfigured must be available.");
  assert.ok(typeof bridge.os.platform === "function", "os.platform must be available.");
  assert.ok(typeof bridge.fs.readFile === "function", "fs.readFile must be available.");
  assert.ok(typeof bridge.path.join === "function", "path.join must be available.");
  assert.ok(typeof bridge.uxp === "object", "uxp namespace must be available.");
  assert.ok(typeof bridge.photoshop === "object", "photoshop namespace must be available.");

  return {
    hasConfigWebviewBridge: true,
    hasOsPlatform: true,
    hasFsReadFile: true,
    hasPathJoin: true,
    hasUxp: true,
    hasPhotoshop: true
  };
}
