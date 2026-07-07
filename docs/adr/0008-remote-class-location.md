# `RemoteClass` lives in a WebView-side shared infrastructure layer

`RemoteClass` is a cross-cutting communication base, not a bridged UXP API module. It is placed in a WebView-side common infrastructure area (e.g. `src/webview/uxp-api/remote/`), imported by the photoshop module and any future stateful module — not inside `modules/photoshop/`.

## Considered Options

- **WebView shared infra layer (chosen):** symmetric with the UXP-side generic handle registry (ADR 0004), honors the "generic" intent of RemoteClass, and respects the AGENTS.md rule that a module directory holds exactly one module (RemoteClass is not a module).
- **Inside `modules/photoshop/`:** rejected — makes a "generic" base private to one module, forces cross-module imports for reuse, and violates the one-module-per-directory rule.

## Consequences

- A WebView common `remote/` area is introduced. It holds only truly cross-cutting pieces: the RemoteObject communication base, reference encode/decode, and the `WeakRef` identity cache. No Photoshop/DOM semantics live here — those stay in `modules/photoshop/`.
- Guard against scope creep: this layer must not accumulate domain logic.
