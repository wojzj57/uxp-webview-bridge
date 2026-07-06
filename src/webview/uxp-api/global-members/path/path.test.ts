import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "path.local",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const joined = await bridge.path.posix.join("plugin:", "webview", "..", "index.html");
      const parsed = await bridge.path.posix.parse("/tmp/example.txt");

      assert.equal(joined, "plugin:/index.html", "path.posix.join should normalize path segments.");
      assert.objectHasKeys(parsed, ["root", "dir", "base", "ext", "name"], "path.posix.parse result");
      assert.equal(parsed.base, "example.txt", "path.posix.parse base");

      return {
        joined,
        parsed
      };
    }
  }
]);
