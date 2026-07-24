import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "os.platform",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const platform = await bridge.os.platform();
      assert.nonEmptyString(platform, "os.platform()");

      return { platform };
    }
  }
]);
