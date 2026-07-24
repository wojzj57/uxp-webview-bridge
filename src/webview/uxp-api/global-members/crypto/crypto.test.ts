import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "crypto.random-values",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const bytes = await bridge.crypto.getRandomValues(new Uint8Array(16));
      const id = await bridge.crypto.randomUUID();

      assert.equal(bytes.length, 16, "crypto.getRandomValues should preserve typed array length.");
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      return {
        length: bytes.length,
        randomUUID: id
      };
    }
  }
]);
