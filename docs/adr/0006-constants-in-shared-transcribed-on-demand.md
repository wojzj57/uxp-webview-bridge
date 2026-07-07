# Photoshop enum constants live in shared, transcribed on demand

Photoshop's DOM exposes dozens of enums (`LayerKind`, `BlendMode`, `AnchorPosition`, `ElementPlacement`, `SaveOptions`, ...) whose runtime values must be identical on both bridge sides and must survive being passed from WebView through to the native Photoshop API. We place their runtime values in the shared layer and transcribe them incrementally.

- **Runtime values:** defined as `as const` objects in `src/shared/uxp-api/photoshop-constants.ts` (or per-concern files under the same shared area), imported by BOTH the WebView namespace and the UXP host. Single source of truth; both sides can never drift.
- **Types:** aligned with Adobe's enum types from `@shared-types/photoshop` where possible, so signatures stay compatible with the official DOM.
- **Exposure:** surfaced on the WebView namespace (e.g. `photoshop.LayerKind`) like XMP's `XMPConst`, so users can write `photoshop.createLayer(LayerKind.TEXT)`.
- **On-demand transcription:** only the enums needed by the current development batch are transcribed. Each transcribed enum records its Photoshop doc source and ships a static test asserting compile-time compatibility with the `@shared-types/photoshop` type. Unused enums are not transcribed ahead of time.

## Considered Options

- **Shared + on-demand (chosen):** matches AGENTS.md ("shared may hold runtime-neutral protocol, constants, assertions"); one source of truth for both sides; work tracks feature batches rather than fronting a large transcription. Cost: values must be hand-transcribed (the `.d.ts` types carry no runtime values) and kept in sync with Photoshop versions.
- **WebView-only constants (XMP-style):** what XMP does today. Rejected for new modules: the UXP side can't reuse the table for argument validation without a second copy, inviting drift.
- **Reuse `@shared-types/photoshop` directly:** rejected as a runtime source — those are `.d.ts` (types only, no importable runtime values). Used for type alignment only.
- **Transcribe all enums upfront:** rejected — blocks the first batch behind unused enums; contradicts the batched delivery plan.

## Consequences

- A hand-maintained shared constants file is the canonical runtime enum source; it lags Photoshop releases until updated.
- Every transcribed enum needs a static compatibility test against `@shared-types/photoshop`; a mismatch (typo'd value) fails compilation/tests.
- XMP's WebView-only `XMPConst` is left as-is; this rule governs new stateful modules only.
