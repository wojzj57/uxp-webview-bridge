# UXP WebView Bridge Test Fixture

This directory contains a real UXP + WebView test fixture.

The first scaffold validates the automation path:

```txt
CDP runner -> UXP plugin context -> webview.postMessage -> WebView test harness
WebView test harness -> window.uxpHost.postMessage -> UXP plugin context
CDP runner -> reads the stored result
```

## Commands

Run all CDP cases in one terminal:

```powershell
pnpm test:uxp
```

Run one case:

```powershell
pnpm test:uxp -- --case uxp.versions
```

Run the opt-in shell external URL case:

```powershell
pnpm test:uxp -- --case uxp.shell-open-external --allow-external-open
```

The auto runner builds the package, prepares the fixture, stops stale UXP DevTools helper processes using ports `14000-14100`, starts `uxp-cli create-cdp-url`, parses the printed `ws://...` URL, runs the requested case or suite, and then stops the helper process.

Open DevTools for manual debugging:

```powershell
pnpm uxp:open-devtools
```

## Test Standards

See [TESTING.md](./TESTING.md) for the testing gates, CDP case structure, result format, and fixture diagnostics.

## Adding Cases

Add bridge-level CDP cases under `test/cdp/cases/{caseName}.mjs`. These are for runner, fixture, and cross-module bridge behavior.

Add WebView module CDP cases next to the module as `src/webview/**/*.test.ts` with `defineWebviewCdpCases(...)` from `@test/cdp/webview-cases.js`:

```ts
import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "fs.text-file-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const filePath = `plugin-data:/example-${Date.now()}.txt`;

      try {
        await bridge.fs.writeFile(filePath, "hello", { encoding: "utf-8" });
        const value = await bridge.fs.readFile(filePath, { encoding: "utf-8" });
        assert.equal(value, "hello", "fs.readFile should return written text.");

        return { value };
      } finally {
        try {
          await bridge.fs.unlink(filePath);
        } catch {
          // Best-effort cleanup; assertions own pass/fail.
        }
      }
    }
  }
]);
```

Colocated case names are global and must include the module prefix, such as `fs.text-file-roundtrip` or `os.platform`. Colocated cases must test through `ctx.bridge`; do not import local module implementations or Node APIs. Use best-effort cleanup for filesystem and resource-handle cases.

The fixture preparation step compiles colocated WebView module cases, copies bridge cases into the fixture, and generates the case registry. `pnpm test:uxp` runs all generated cases by default.

Photoshop cases that need document state must create a minimal document through `ctx.bridge.photoshop.app.createDocument` and close it without saving in `finally`. If isolated creation is unavailable, skip before reading or mutating `activeDocument`; the test suite never borrows a user's document as fixture state.

## Fixture Notes

The WebView is loaded from local plugin content:

```html
<webview src="plugin:/webview/index.html" uxpAllowInspector="true"></webview>
```

This requires UXP v8.0 or later and `requiredPermissions.webview.allowLocalRendering` set to `"yes"` in `test/uxp-plugin/manifest.json`.

The fixture may enable test-only capabilities needed by CDP cases, such as `fs: true` for real plugin-data filesystem tests. Keep those capability overrides in `test/uxp-plugin/host.js`; do not change production defaults just to satisfy CDP coverage.
