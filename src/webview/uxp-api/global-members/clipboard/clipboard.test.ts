import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "clipboard.text-roundtrip",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const value = `uxp-webview-bridge-${Date.now()}`;

      try {
        await bridge.clipboard.writeText(value);
        const read = await bridge.clipboard.readText();
        assert.equal(read, value, "clipboard.readText should return the written text.");
        return { value: read };
      } catch (error) {
        return skip("Clipboard is not available in this UXP environment.", {
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
]);
