import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "session-storage.text-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const key = `uxp-webview-bridge:${Date.now()}`;
      const value = "session-storage-value";

      try {
        await bridge.sessionStorage.setItem(key, value);
        assert.equal(await bridge.sessionStorage.getItem(key), value);
        assert.ok((await bridge.sessionStorage.length) >= 1, "sessionStorage.length should be non-negative.");
        return { key };
      } finally {
        await bridge.sessionStorage.removeItem(key);
      }
    }
  }
]);
