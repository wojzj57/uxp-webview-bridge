import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "local-storage.text-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const key = `uxp-webview-bridge:${Date.now()}`;
      const value = "local-storage-value";

      try {
        await bridge.localStorage.setItem(key, value);
        assert.equal(await bridge.localStorage.getItem(key), value);
        assert.ok((await bridge.localStorage.length) >= 1, "localStorage.length should be non-negative.");
        return { key };
      } finally {
        await bridge.localStorage.removeItem(key);
      }
    }
  }
]);
