# RFC-0009: Photoshop batchPlay passthrough module

Status: ready-for-agent
Source: notes/photoshop-full-coverage-roadmap.md (§3, line B), ADR docs/adr/0010 (batchplay-passthrough-line)
Related: RFC-0004 (shared protocol & constants), RFC-0006 (photoshop uxp host adapter), ADR docs/adr/0007 (execute-as-modal-boundary), CONTEXT.md, AGENTS.md

## Summary

Add `photoshop.action.batchPlay(commands, options?)` on the WebView namespace as a single passthrough RPC to the host's real `require("photoshop").action.batchPlay`. Command and result descriptor arrays cross the bridge as verbatim JSON; no descriptor is inspected, reference-decoded, or transformed on either side (ADR 0010). The host wraps every call in `executeAsModal` and forwards Adobe's options (`modalBehavior`, `synchronousExecution`, `commandName`, …) unchanged. WebView types re-export Adobe's `ActionDescriptor` / `BatchPlayCommandOptions` rather than defining our own. This line is independent of the DOM registries (RFC-0008) and can land on its own.

## Context & Problem

`batchPlay` is the low-level action API: `batchPlay(commands: ActionDescriptor[], options?): Promise<ActionDescriptor[]>` over schema-less, arbitrarily-nested descriptors. It has no class, no properties, no stable identity, so it does not fit the RemoteClass/registry model used for DOM objects (ADR 0002/0009). Modeling its internal structure would mean modeling all of Photoshop's action protocol — unbounded and version-fragile. ADR 0010 fixes it as a verbatim JSON pipe with no reference mapping (descriptor `_ref`/`_id` use Photoshop's native id space, disjoint from our handle registry), Adobe-supplied types, and blanket `executeAsModal` with option passthrough.

## Design

**WebView surface.** Extend `PhotoshopNamespace` with an `action` sub-object exposing one method:

```ts
action: {
  batchPlay(
    commands: ActionDescriptor[],
    options?: BatchPlayCommandOptions
  ): Promise<ActionDescriptor[]>;
}
```

`ActionDescriptor` and `BatchPlayCommandOptions` are re-exported from `@shared-types/photoshop` (Adobe). The method makes one `rpc.call(PHOTOSHOP_MODULE_ID, "action.batchPlay", [commands, options])` and returns the raw result array unchanged. No encode step (RemoteClass arg-encoding is not applied — there are no proxy instances to encode; callers pass native ids themselves).

**Host dispatch.** Add an `action.` branch to `dispatchPhotoshopCall` (`host.ts`), alongside `app.` / `document.` / `layer.` / `layers.`:

```
action.batchPlay → getPhotoshop().action.batchPlay(commands, options)  // inside executeAsModal
```

- The host validates only shape: `commands` is an array, `options` is an object or undefined. It does NOT walk or rewrite descriptors, and does NOT run them through `decodeValue`/the handle registry (that would corrupt native `_ref`/`_id`).
- The call is wrapped in `executeAsModal` unconditionally (ADR 0010); Adobe's `options` are forwarded verbatim so callers can set `modalBehavior`/`synchronousExecution`. The existing `executeAsModal(commandName, fn)` helper is reused; `commandName` defaults to `"action.batchPlay"` but a caller-provided `options.commandName` is respected by Adobe's own API.
- The raw result descriptor array is returned as-is (structured-clone-safe JSON); no serialization pass.

**Protocol.** Add `"action.batchPlay"` to the photoshop protocol method-name set (`photoshop-protocol.ts`) so `assertPhotoshopProtocolMethodName` accepts it. No new envelope shapes — payloads are plain JSON.

**Errors.** A rejected modal scope or invalid descriptor surfaces as `BridgeRemoteError` with host error metadata, consistent with the rest of the module.

## Scope

**In scope**
- Protocol: add `"action.batchPlay"` method name.
- WebView: `action.batchPlay` on the namespace (new `action.ts` under the photoshop module or a small addition to `photoshop.ts`); re-export Adobe's `ActionDescriptor` / `BatchPlayCommandOptions` types from the WebView public types.
- Host: `action.` dispatch branch in `host.ts`; shape validation; modal wrap; verbatim passthrough.
- Public export: `photoshop.action.batchPlay` reachable from `uxp-webview-bridge/webview`.
- Tests per §Testing.

**Out of scope**
- Any descriptor reference/id mapping between our proxies and native `_ref`/`_id` (explicitly excluded by ADR 0010).
- Defining our own descriptor/option types (use Adobe's).
- The `action` system's other members (`addNotificationListener`, etc.) — this RFC delivers `batchPlay` only; further members are separate increments if ever needed.
- Binary payloads (imaging is RFC-0010); batchPlay carries only JSON.

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| WebView namespace | add `action: { batchPlay(commands, options?): Promise<ActionDescriptor[]> }` |
| Types | re-export Adobe `ActionDescriptor`, `BatchPlayCommandOptions` |
| Protocol method | add `"action.batchPlay"` |
| Host dispatch | new `action.` branch; verbatim in/out; unconditional `executeAsModal`; options passthrough |
| Reference handling | none — descriptors are opaque JSON; native ids are the caller's responsibility |

## Implementation plan

1. `photoshop-protocol.ts`: add `"action.batchPlay"` to the method-name union/set.
2. WebView: add the `action.batchPlay` method (verbatim forward + raw return); attach `action` to the namespace object in `photoshop.ts`; re-export Adobe types in the WebView public types.
3. Host: add the `action.` branch to `dispatchPhotoshopCall`; implement shape validation + modal-wrapped verbatim call + raw return.
4. `pnpm typecheck` + `pnpm test:static`; then `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp`.

## Testing

- **WebView unit seam (stubbed rpc):** `action.batchPlay(cmds, opts)` issues exactly one `action.batchPlay` RPC with `[cmds, opts]` and returns the stub's result array unchanged (no transformation, no reference decode).
- **Static (no Photoshop):** `"action.batchPlay"` is accepted by `assertPhotoshopProtocolMethodName`; the WebView signature type-checks against Adobe's `ActionDescriptor[]` / `BatchPlayCommandOptions`.
- **Co-located CDP (real Photoshop, `test:uxp`):** `photoshop.batchplay-roundtrip` — a read-style descriptor (e.g. `{ _obj: "get", _target: [...] }`) returns a descriptor array; a write-style descriptor (e.g. a `make`/`set`) mutates and returns; confirm a descriptor carrying a native layer id (obtained via `await layer.id`) targets the intended layer, proving the "caller supplies native id" workflow.

## Dependencies

None. Independent of RFC-0008 (foundation) and RFC-0010 (imaging); may land in any order relative to them. Touches only `host.ts`, `photoshop.ts`, protocol, and public types.

## Open questions

None.
