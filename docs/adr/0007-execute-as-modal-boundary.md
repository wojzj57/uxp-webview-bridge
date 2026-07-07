# `executeAsModal` driven by descriptor-table `mutating` flags, owned by the UXP host

Photoshop requires that any operation modifying the document or application state run inside `require('photoshop').core.executeAsModal(fn)`, while reads must NOT enter modal execution unnecessarily. We make mutating-ness a declared attribute in the descriptor table and let the UXP host dispatch wrap modal execution accordingly.

- Each descriptor-table property setter and each method carries `mutating: true | false`.
- On the UXP side, dispatch inspects the flag: a mutating call runs as `executeAsModal(() => realCall())`; a read/non-mutating call runs directly.
- The WebView side never knows about modal execution — it only sends calls. `executeAsModal` is pure UXP execution semantics, owned by the host (per AGENTS.md).

## Considered Options

- **Descriptor-table `mutating` flag + UXP-side modal wrap (chosen):** mutating-ness lives with the property/method declaration (single source of truth, like `writable`); the WebView stays ignorant of modal; reads and writes are cleanly separated. Cost: one extra descriptor field and modal-wrap logic in dispatch.
- **WebView sends a `modal: true` flag:** rejected — leaks UXP execution semantics into the WebView, which should not know Photoshop's modal rules.
- **Wrap every operation in modal:** rejected — violates "reads should not enter modal", slows reads, and can interfere with in-progress user edits.

## Consequences

- `batchSet` of multiple mutating properties runs inside a **single** `executeAsModal` scope (one RPC = one modal scope), not one modal per property — avoiding "already in a modal" errors and per-property overhead.
- v1 does NOT serialize concurrent mutating calls on the UXP side. If the WebView issues overlapping mutating calls, Photoshop's own modal-conflict error is surfaced to the WebView as a `BridgeRemoteError`; callers serialize their own mutations. Automatic UXP-side serialization of mutating calls is deferred to a future ADR if needed.
- The descriptor table's `mutating` flag participates in the static consistency test alongside `writable`.
