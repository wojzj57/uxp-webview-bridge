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
pnpm test:uxp -- --case os.platform
```

The auto runner builds the package, prepares the fixture, stops stale UXP DevTools helper processes using ports `14000-14100`, starts `uxp-cli create-cdp-url`, parses the printed `ws://...` URL, runs the requested case or suite, and then stops the helper process.

Open DevTools for manual debugging:

```powershell
pnpm uxp:open-devtools
```

## Test Standards

See [TESTING.md](./TESTING.md) for the testing gates, CDP case structure, result format, and fixture diagnostics.

## Adding Cases

Add WebView-side CDP cases under `test/cdp/cases/{caseName}.mjs`. The fixture preparation step automatically copies those cases into the WebView fixture and generates the case registry. `pnpm test:uxp` runs all immediate `.mjs` files in that directory by default.

## Fixture Notes

The WebView is loaded from local plugin content:

```html
<webview src="plugin:/webview/index.html" uxpAllowInspector="true"></webview>
```

This requires UXP v8.0 or later and `requiredPermissions.webview.allowLocalRendering` set to `"yes"` in `test/uxp-plugin/manifest.json`.
