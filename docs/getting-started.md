[简体中文](./zh/getting-started.md)

# Getting started

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

## Prerequisites and package availability

You need an Adobe UXP plugin with a WebView, separate UXP-host and WebView bundles, and control of both sides. Install the package from the public npm registry:

```powershell
pnpm add uxp-webview-bridge
```

Repository contributors build it locally with:

```powershell
pnpm install
pnpm build
```

Bundle the package's `/uxp` and `/webview` entrypoints into their respective runtimes. In a local pnpm workspace, the package can instead be linked with the `workspace:*` protocol.

## 1. Add a local WebView

The repository fixture loads local plugin content. Local rendering requires UXP 8.0 or later and the corresponding manifest permission:

```html
<webview id="plugin-webview" src="plugin:/webview/index.html"></webview>
```

```json
{
  "requiredPermissions": {
    "webview": {
      "allow": "yes",
      "allowLocalRendering": "yes",
      "enableMessageBridge": "localAndRemote"
    }
  }
}
```

This is a fixture-shaped excerpt, not a universal production minimum. Complete the manifest for the target Adobe host/version and select the narrowest permissions your application needs. Remote WebView content also needs an appropriate WebView domain policy and an explicit bridge-origin policy; see [Security and permissions](./security-and-permissions.md).

## 2. Configure one UXP host runtime

Configure the host before the WebView makes namespace calls. The example uses only the public UXP subpath and leaves capabilities at their enabled defaults because the walkthrough only reads `os` and the non-configurable UXP version properties. For remote or otherwise untrusted content, explicitly configure all capability keys and disable every unused surface.

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";

interface PluginWebViewElement extends Element {
  postMessage(message: unknown): void;
}

function isPluginWebViewElement(element: Element | null): element is PluginWebViewElement {
  return element !== null && "postMessage" in element && typeof element.postMessage === "function";
}

const webview = document.querySelector("#plugin-webview");
if (!isPluginWebViewElement(webview)) {
  throw new Error("The plugin WebView is missing or does not support postMessage().");
}

const hostRuntime = configUxpBridge({
  webview,
  allowedOrigins: ["plugin:"]
});

window.addEventListener("unload", () => hostRuntime.destroy(), { once: true });
```

Create exactly one host runtime for each WebView. A second `configUxpBridge()` call adds another message listener; it does not replace the first runtime. Destroy the old runtime before reconfiguration or before removing the WebView.

## 3. Configure one WebView client and make a call

Configure the WebView client before the first remote operation. The configured client is module-global, so give one application component ownership of setup and teardown.

```ts
import { configWebviewBridge, os, uxp } from "uxp-webview-bridge/webview";

const webviewRuntime = configWebviewBridge({ timeoutMs: 10_000 });

try {
  const [platform, uxpVersion] = await Promise.all([
    os.platform(),
    uxp.versions.uxp
  ]);
  console.log({ platform, uxpVersion });
} finally {
  webviewRuntime.destroy();
}
```

The default request timeout is 10 seconds. Calling `configWebviewBridge()` again destroys and replaces the current client and rejects that client's pending requests. Although the namespace layer can lazily create a client, explicit setup keeps timeout and ownership visible.

## Lifecycle ownership

- **One WebView client owner:** configure and destroy the single module-global client. Treat reconfiguration as replacement, not additive setup.
- **One host runtime per WebView:** retain its runtime and destroy it deterministically. Duplicate host setup can produce duplicate listeners and responses.
- **One global fetch owner:** if using `installFetch()`, do not overlap installations. It is not reference-counted, and any active uninstaller can restore the captured previous global fetch.

Destroy the WebView client before tearing down the page, and destroy the UXP host runtime before removing or replacing the WebView element.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `window.uxpHost` is missing | Confirm the page runs inside a UXP WebView with the message bridge enabled, not in a normal browser tab. |
| A request times out | Confirm the host runtime was configured first, the target is correct, and the operation can finish within `timeoutMs` (10 seconds by default). |
| The host ignores a message | A different truthy `event.source` is rejected. A missing/null source proceeds to origin validation; it is not accepted without that check. |
| Origin rejection | Match `allowedOrigins` to the normalized event origin. Scheme entries ending in `:` are prefix matches; other values are exact normalized origins. Built-in local and loopback origins do not need to be added. |
| Capability error | Enable only the capability that gates the namespace. All configurable capabilities default to enabled, so disable unused surfaces explicitly. |
| Native permission error | Add the relevant UXP manifest permission; bridge capabilities do not grant native permission. |
| `BridgeRemoteError` | Inspect its remote name/message/stack/code and `operationId`; the native operation failed after crossing the bridge. |
| `Bridge request <operationId> was cancelled.` during setup | Another owner replaced the module-global WebView client while work was pending. |
| Duplicate handling or responses | More than one host runtime may be listening for the same WebView. Destroy duplicates and establish one owner. |
| Global fetch is restored unexpectedly | Multiple `installFetch()` owners overlapped. Use one owner and one `try/finally` cleanup boundary. |

Continue with [Security and permissions](./security-and-permissions.md) before enabling remote content or broad native operations.
