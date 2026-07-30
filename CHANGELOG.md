# uxp-webview-bridge

## 0.2.0

### Minor Changes

- 8c10c5a: ## Breaking Changes

  Replace permissive boolean capability overrides with a default-deny namespaced allowlist. Omitting `capabilities` now denies every Business RPC, including previously ungated `crypto`, `path`, `uxp.host`, and `uxp.versions` calls. Photoshop authorization is split into independent `photoshop.dom`, `photoshop.core`, `photoshop.imaging`, and `photoshop.batchPlay` leaves.

  Before:

  ```ts
  configUxpBridge({
    webview,
    capabilities: { fs: true, shell: true, photoshop: true },
  });
  ```

  After:

  ```ts
  configUxpBridge({
    webview,
    capabilities: ["fs", "uxp.shell", "photoshop.dom"],
  });
  ```

  Top-level `capabilities: "all"` is an intentionally permissive migration escape hatch. It and the `photoshop.all`, `uxp.all`, and `uxp.storage.all` groups expand to leaves known to the installed version, so their authority may grow after an upgrade; enumerate leaves for stable least privilege.

  Capability denials now arrive as `BridgeRemoteError` with `code` set to `ERR_BRIDGE_CAPABILITY_DISABLED`, remote name `BridgeCapabilityError`, and structured `operationId`, `capability`, `module`, and `method` fields.

## 0.1.0

### Minor Changes

- 94833d3: Breaking Changes

  - Expand `BridgeCapabilities` to 15 keys and enable every capability by default, including `fs`; hosts serving remote or otherwise untrusted WebViews should explicitly disable every unused capability.

  Features

  1. Export `RemoteResult` and let Photoshop, Imaging, XMP, and persistent-storage object results support both split awaits and a single chained await while preserving queued property-write ordering.
  2. Add typed `batchGet` and awaitable `batchSet` operations to remote classes, with local key validation, invocation-time value snapshots, decoded result types, and host-completion guarantees.
  3. Add host-side capability gates for filesystem, clipboard, storage, forwarded fetch, Photoshop Imaging, and public `batchPlay` calls so each exposed bridge surface can be disabled independently.

  Fixes

  1. Normalize HTTP and HTTPS origin candidates before validation so URLs with paths, queries, or fragments match their canonical trusted origin without accepting hostname or user-info spoofing.
  2. Keep delayed remote setter failures observable exactly once and apply chainable remote-result behavior consistently to nullable and union reference results.

  Documentation

  1. Add English and Chinese guides for installation, bridge configuration, UXP and Photoshop APIs, forwarded fetch, capability security, remote objects, callbacks, cancellation, and resource cleanup.

  Maintenance

  1. Add Changesets-backed release automation that publishes only after successful `main` CI and creates changelogs, version tags, and GitHub Releases for published versions.
