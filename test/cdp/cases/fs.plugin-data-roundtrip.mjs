export default async function fsPluginDataRoundtrip({ bridge, assert }) {
  bridge.ensureConfigured();

  const path = `plugin-data:/uxp-webview-bridge-cdp-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.txt`;
  const expected = "uxp-webview-bridge cdp fs roundtrip";

  try {
    await bridge.fs.writeFile(path, expected, { encoding: "utf-8" });
    const actual = await bridge.fs.readFile(path, { encoding: "utf-8" });

    assert.equal(actual, expected, "fs readFile should return the written text.");

    return { path, bytes: expected.length };
  } finally {
    try {
      await bridge.fs.unlink(path);
    } catch {
      // Best-effort cleanup; the assertion above owns pass/fail.
    }
  }
}
