# batchPlay is a pure JSON passthrough RPC, outside the RemoteClass model

Full ps-reference coverage was expanded to include `require("photoshop").action.batchPlay`, the low-level action API. Unlike the DOM classes (Document/Layer/…), batchPlay has no class, no properties, no identity: `batchPlay(commands: ActionDescriptor[], options?): Promise<ActionDescriptor[]>` takes an array of untyped, arbitrarily-nested action descriptors (`{ _obj, _target, ... }`) and returns the same. It is Photoshop's internal command language, not a stateful object. It therefore cannot and should not be modeled with the RemoteClass/registry machinery (ADR 0002/0009); forcing it in would mean modeling the entire, schema-less Photoshop action protocol — an unbounded task.

We treat batchPlay as a **single passthrough RPC**: the WebView `photoshop.action.batchPlay(commands, options)` forwards the descriptor array to the host verbatim, the host calls the real `batchPlay` inside `executeAsModal`, and the result descriptors are returned verbatim. No descriptor is inspected, transformed, or reference-decoded on either side.

Three sub-decisions define the line:

- **No reference encode/decode.** Descriptors may contain Photoshop-native references (`{ _ref: "layer", _id: <native id> }`). These use Photoshop's own id space, which is disjoint from our handle-registry reference-id space (ADR 0004). We do not map between them. A caller who wants to target one of our proxied objects must first `await layer.id` and place the native id into the descriptor themselves. batchPlay stays a verbatim JSON pipe.
- **Adobe types, not our own.** The WebView signature re-exports Adobe's `ActionDescriptor` / `BatchPlayCommandOptions` from `@shared-types/photoshop`. We do not transcribe these types; they are vast and Adobe-maintained.
- **Modal by default, options passed through.** batchPlay commands cannot be statically classified as read vs write, so every call is wrapped in `executeAsModal`. Adobe's `modalBehavior` / `synchronousExecution` options are forwarded so advanced callers retain control.

## Considered Options

- **Pure JSON passthrough, Adobe types, default-modal (chosen):** near-zero maintenance — the line never breaks when Adobe changes descriptor structure, because nothing here understands that structure. Cost: callers must hand-convert our proxy ids to native ids; no ergonomic bridge between DOM proxies and batchPlay.
- **Reference-aware batchPlay (walk descriptors, swap our reference envelopes ↔ native `_ref`/`_id`):** ergonomic (pass a `PsLayer` straight into `_target`). Rejected: two disjoint id spaces make the mapping fragile; requires deep, version-sensitive knowledge of descriptor shape; breaks whenever Adobe adds a reference form. High risk for marginal ergonomics on an already-advanced API.
- **Do not bridge batchPlay at all:** simplest. Rejected: the coverage goal explicitly includes it, and many capabilities exist only via batchPlay.
- **Per-command modal classification:** avoid modal for read-only descriptors. Rejected: descriptor intent is not statically knowable; misclassifying a write as a read fails at runtime. Blanket-modal is safe; callers can override via options.

## Consequences

- batchPlay lives as its own tiny module/dispatch path, independent of the DOM registries; it does not depend on RFC-0008's foundation and can land in parallel.
- Users cannot pass our `PsDocument`/`PsLayer` proxies directly into descriptors; documentation must state the `await x.id` → native-id workflow.
- Because we forward Adobe's option object as-is, `commandName`, `modalBehavior`, `synchronousExecution`, etc. behave exactly as Adobe documents; we add no options and validate none beyond "is an object".
- The descriptor payload still crosses the bridge as JSON (structured-clone-safe); batchPlay does not itself carry binary (that concern belongs to imaging, ADR 0011). Large descriptor arrays are ordinary JSON and are not chunked.
- Errors from `batchPlay` (rejected modal, invalid descriptor) surface as `BridgeRemoteError` with the host error metadata, like any other remote failure.
