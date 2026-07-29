[简体中文](./zh/security-and-permissions.md)

# Security and permissions

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

Security is the intersection of three independent controls. Enabling one does not satisfy either of the others.

## Three separate controls

1. **UXP manifest permission** decides whether the native host permits a class of operation, such as network or filesystem access.
2. **Message source/origin validation** decides whether the host accepts a bridge message from the configured WebView context and origin.
3. **Bridge capability** decides whether a capability-gated adapter or UXP method family is dispatched.

A capability does not grant a manifest permission. A manifest permission does not authorize an arbitrary WebView origin. Origin acceptance does not add a capability gate to an ungated namespace.

## Source and origin validation

The host conditionally checks `event.source`. When a source is present/truthy and differs from the configured WebView, the message is rejected. When `event.source` is missing or null, the message proceeds to origin validation; source identity is therefore not an unconditional second gate.

The origin must be accepted in both cases. Built-in acceptance covers `plugin:`, `plugin-data:`, and `plugin-temp:`, plus HTTP and HTTPS loopback origins on `localhost` or `127.0.0.1` with any valid port. Matching works as follows:

- an allowed value ending in `:` is a prefix match;
- any other allowed value must match the normalized event origin exactly.

Prefer the smallest explicit `allowedOrigins` list. In particular, adding `http:` or `https:` trusts the entire scheme, not one site. For remote content, use an exact origin when the event-origin shape permits it, keep the WebView domain allowlist narrow, and never treat conditional source validation as a sandbox.

## Effective bridge capabilities

All 15 configurable capabilities default to enabled. The table reports the current dispatch gates.

| Config key | Default | Effective current gate |
| --- | ---: | --- |
| `fs` | on | `fs` namespace |
| `os` | on | `os` namespace |
| `clipboard` | on | `clipboard` namespace |
| `localStorage` | on | asynchronous `localStorage` namespace |
| `sessionStorage` | on | asynchronous `sessionStorage` namespace |
| `fetch` | on | forwarded host `fetch` and `installFetch()` replacement |
| `shell` | on | `uxp.shell` |
| `userInfo` | on | `uxp.userInfo` |
| `pluginManager` | on | `uxp.pluginManager` |
| `keyValueStorage` | on | `uxp.storage.secureStorage` |
| `persistentFileStorage` | on | `uxp.storage.localFileSystem` and related storage proxies |
| `xmp` | on | `uxp.xmp` |
| `photoshop` | on | Parent gate for Photoshop DOM, Action, Core, and Imaging adapters |
| `imaging` | on | Photoshop Imaging; also requires `photoshop` |
| `batchPlay` | on | Three public batchPlay RPC methods; also requires `photoshop` |

`crypto`, `path`, `uxp.host`, and `uxp.versions` have no configurable capability and remain available to every accepted origin.

For least privilege, specify all 15 keys for a remote or otherwise untrusted WebView and disable every surface it does not use. Disabling `imaging` blocks Imaging without disabling other Photoshop APIs. Disabling `batchPlay` blocks the three public batchPlay RPC methods without blocking internal DOM implementation calls. Disable `photoshop` to gate the entire implemented Photoshop DOM, Action, Core, and Imaging surface.

## UXP manifest permission mapping

The repository's `test/uxp-plugin/manifest.json` proves fixture syntax and test requirements only. It deliberately enables broad values such as all network domains, full filesystem access, multiple launch schemes/extensions, read/write clipboard, user information, permissive WebView settings, IPC, and code generation from strings. Those values are **test-only evidence**, not production least privilege.

| Feature | Relevant fixture permission key |
| --- | --- |
| WebView and message bridge | `requiredPermissions.webview` (`allow`, local rendering, message bridge, and domains as applicable) |
| Forwarded fetch | `requiredPermissions.network` |
| Direct filesystem/persistent file access | `requiredPermissions.localFileSystem` |
| Shell path/URL launching | `requiredPermissions.launchProcess` |
| Clipboard | `requiredPermissions.clipboard` |
| User identity | `requiredPermissions.enableUserInfo` |

Select exact production values from the Adobe manifest contract for the target host and version. This repository does not prove a universal minimum. Do not copy fixture-only `ipc`, `allowCodeGenerationFromStrings`, `"all"` domains, all extensions, or full filesystem access unless the application independently requires and reviews them.

## Data and secret handling

- Keep credentials out of URLs, logs, examples, `localStorage`, and `sessionStorage`.
- Use `uxp.storage.secureStorage` for secret bytes and remove values no longer needed.
- Forwarded fetch avoids WebView CORS enforcement because the UXP host performs the request. It does not exceed manifest network permission, and it must not become a general request primitive for an untrusted origin.
- Treat Photoshop action descriptors and paths as caller-controlled input. Validate application-level intent before giving a WebView access to mutating or broad native operations.
- Dispose transient storage, XMP, and imaging resource handles so host resources are not retained until timeout cleanup.

## Diagnose a rejection

| Failure stage | Typical evidence | Resolution |
| --- | --- | --- |
| WebView policy | Page or bridge unavailable | Correct the target host/version manifest without broadening unrelated permissions. |
| Source check | A different truthy source is ignored | Send through the configured WebView; do not rely on null source as authorization. |
| Origin check | Accepted WebView produces no dispatch | Match the real origin with the narrowest `allowedOrigins` entry. |
| Capability check | Capability-disabled bridge error | Enable the effective key only after reviewing the WebView's need. |
| Native permission/API | `BridgeRemoteError` from UXP/Photoshop | Add only the required manifest permission or handle host/API limitations. |

Review the feature-specific prerequisites in [UXP](./uxp.md), [Photoshop](./photoshop.md), and [Forwarded fetch](./fetch.md).
