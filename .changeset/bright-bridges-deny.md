---
"uxp-webview-bridge": minor
---

## Breaking Changes

Replace permissive boolean capability overrides with a default-deny namespaced allowlist. Omitting `capabilities` now denies every Business RPC, including previously ungated `crypto`, `path`, `uxp.host`, and `uxp.versions` calls. Photoshop authorization is split into independent `photoshop.dom`, `photoshop.core`, `photoshop.imaging`, and `photoshop.batchPlay` leaves.

Before:

```ts
configUxpBridge({
  webview,
  capabilities: { fs: true, shell: true, photoshop: true }
});
```

After:

```ts
configUxpBridge({
  webview,
  capabilities: ["fs", "uxp.shell", "photoshop.dom"]
});
```

Top-level `capabilities: "all"` is an intentionally permissive migration escape hatch. It and the `photoshop.all`, `uxp.all`, and `uxp.storage.all` groups expand to leaves known to the installed version, so their authority may grow after an upgrade; enumerate leaves for stable least privilege.

Capability denials now arrive as `BridgeRemoteError` with `code` set to `ERR_BRIDGE_CAPABILITY_DISABLED`, remote name `BridgeCapabilityError`, and structured `operationId`, `capability`, `module`, and `method` fields.
