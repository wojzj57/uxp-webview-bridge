---
"uxp-webview-bridge": minor
---

Breaking Changes

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
