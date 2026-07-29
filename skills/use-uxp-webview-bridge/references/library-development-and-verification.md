# Library development and verification

Keep `src/webview` WebView-only and never import `src/uxp`. Keep `src/uxp` UXP-host-only and never import `src/webview`. Keep `src/shared` runtime-neutral: protocol, errors, transport shapes, capabilities, and pure utilities only.

Maintain symmetric bridged modules under `src/webview/.../modules/{moduleName}` and `src/uxp/.../modules/{moduleName}`. One directory owns one module. In `src`, use `./` and `../`; replace deeper relative imports with configured path aliases.

Preserve the public setup API: `configWebviewBridge` and `configUxpBridge`. WebView exports are direct remote namespaces. Do not reintroduce factory/setup APIs removed from the public contract.

For every `src` change run:

```bash
pnpm typecheck
pnpm test:static
pnpm build
```

Run `pnpm test` for the full local gate (`static`, typecheck, build, contracts). Run `pnpm test:uxp` only when a compatible Adobe host and fixture are available. Native availability varies by Photoshop version, platform, manifest permissions, and document state; only documented/exported bridge members are supported.
