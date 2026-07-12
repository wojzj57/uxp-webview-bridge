import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "clipboard.text-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const value = `uxp-webview-bridge-${Date.now()}`;
      await bridge.clipboard.writeText(value);
      const read = await bridge.clipboard.readText();
      assert.equal(read, value, "clipboard.readText should return the written text.");
      return { value: read };
    }
  }
]);
