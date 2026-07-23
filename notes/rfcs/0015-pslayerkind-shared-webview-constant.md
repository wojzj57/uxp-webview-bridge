# RFC-0015: PSLayerKind Shared WebView constant

Status: proposed
Source: WOJ-24 approved requirements baseline (approval comment `f79d7b2c-3bad-429d-91ab-df2de37f187b`; RFC_DESIGN handoff dated 2026-07-23)
Depends on: RFC-0004, RFC-0007
ADR required: No — this applies ADR-0006's existing Shared constants decision

## Summary

Add Adobe's `PSLayerKind` numeric enum to the generated Shared Photoshop constants and expose it synchronously through both `photoshop.PSLayerKind` and `photoshop.constants.PSLayerKind`. Extend the generator to read one explicitly selected enum from `Layer.d.ts` in addition to every enum in `Constants.d.ts`, while preserving generated-file ownership, exact Adobe naming, existing table order, and the no-RPC contract. Generator input, generated output, namespace exposure, and drift tests form one independently implementable unit.

## Context and Constraints

Verified repository facts:

- `Constants.d.ts` contains 102 enums already generated into `photoshop-constants.ts`.
- `PSLayerKind` is the sole remaining enum outside that file and occurs only in `src/shared/types/photoshop/internal/dom/Layer.d.ts`.
- It has 14 numeric, lower-camel-case members from `any = 0` through `groupEnd = 13`.
- The generator currently parses only `Constants.d.ts`, emits one `as const` object and `*Value` type per enum, and builds `PhotoshopConstants`.
- `createPhotoshopNamespace` already assigns `constants: PhotoshopConstants` and spreads `...PhotoshopConstants`; `PhotoshopNamespace` extends `PhotoshopConstantsNamespace`. Aggregate generation therefore provides runtime and type exposure without new WebView runtime code.
- The contract test compares generated values with vendored declarations, verifies direct/aggregate identity, and uses a throwing fake RPC client.
- The colocated `photoshop.test.ts` owns compile-time enum compatibility and the `photoshop.public-shape` CDP case.

Constraints:

- Preserve the exact public name `PSLayerKind`; do not normalize it to `PsLayerKind` or `LayerKind`.
- Preserve every member name and numeric value exactly.
- Expose a Shared-owned, synchronous, non-Promise-like WebView value that sends no bridge traffic.
- Add no RPC method, payload, capability, UXP adapter, remote object, or native constant requirement.
- Do not edit vendored declarations. Keep `photoshop-constants.ts` generator-owned.
- Retain the order and identity of all 102 tables; append `PSLayerKind` as table 103.

The code evidence was inspected read-only at local revision `fe2cae8`; unrelated dirty changes were not treated as requirements. The isolated `origin/main` checkout contained only `LICENSE`, so implementation requires an isolated branch based on the code-bearing repository state.

## Design

### Generator source policy

Replace the single source with this ordered manifest:

1. `Constants.d.ts`: include every top-level enum in source order.
2. `Layer.d.ts`: include only the top-level enum named `PSLayerKind`.

Explicit selection is deliberate. Indiscriminately publishing future enums found in class declaration files would silently broaden the API and violate ADR-0006's on-demand policy.

Parse both files with the existing TypeScript AST logic. Before rendering, fail with source/enum context if an explicitly selected enum is missing, selected more than once, or duplicates a name collected from another source. Continue accepting only supported member names and string/numeric literal initializers. Validate all sources before writing so failures cannot produce partial output.

Render deterministically: keep the existing 102 tables in place, append `PSLayerKind`, and list both declaration sources in the generated header. `--check` continues to compare expected and committed output byte-for-byte.

### Shared and WebView shape

| Member | Value | Member | Value |
| --- | ---: | --- | ---: |
| `any` | 0 | `pixel` | 1 |
| `adjustment` | 2 | `text` | 3 |
| `vector` | 4 | `smartObject` | 5 |
| `video` | 6 | `group` | 7 |
| `threeD` | 8 | `gradient` | 9 |
| `pattern` | 10 | `solidColor` | 11 |
| `background` | 12 | `groupEnd` | 13 |

Generated exports are `PSLayerKind`, `PSLayerKindValue` (`0 | 1 | ... | 13`), and `PhotoshopConstants.PSLayerKind`. `PhotoshopConstantsNamespace` gains the readonly property. Follow the established `as const` convention; do not add runtime `Object.freeze`.

No changes are required in `photoshop.ts` or `types.ts`. Existing composition guarantees:

- `photoshop.PSLayerKind === PhotoshopConstants.PSLayerKind`;
- `photoshop.constants.PSLayerKind === PhotoshopConstants.PSLayerKind`;
- access is immediate, non-Promise-like, and invokes no RPC.

Shared ownership permits internal reuse, but this RFC adds no UXP public namespace and does not require native `require(photoshop).constants` to contain `PSLayerKind`.

### Test contracts

The contract test collects all enums from `Constants.d.ts` plus exactly `PSLayerKind` from `Layer.d.ts`. It asserts 103 generated tables, exact values, identity across paths, and no Promise/RPC behavior. Including `ColorConversionModel`, WebView exposes 104 public constant types.

Compile-time consistency imports Adobe's numeric `PSLayerKind` from `Layer.d.ts` and generated `PSLayerKindValue`, then proves mutual assignability. Exhaustive name assertions use the 102 `Constants.d.ts` enum names plus `PSLayerKind`; they must not be weakened because `AdobeConstants` omits the separate enum.

The `photoshop.public-shape` case updates counts to 103/104 and asserts `groupEnd === 13` plus direct/aggregate identity. The native-host snapshot remains a subset comparison; native Photoshop need not expose `PSLayerKind`.

## Scope

### In scope

- `scripts/generate-photoshop-constants.mjs`: ordered sources, explicit selector, missing/duplicate validation.
- `src/shared/photoshop-api/photoshop-constants.ts`: regenerated `PSLayerKind`, `PSLayerKindValue`, aggregate entry, provenance.
- `test/contract/photoshop-constants.test.mjs`: two-source declaration baseline and 103/104 assertions.
- `src/webview/photoshop-api/modules/photoshop/photoshop.test.ts`: numeric compatibility, exhaustive expected names, public-shape assertions.

### Out of scope

- Editing `Layer.d.ts` or `Constants.d.ts`.
- RPC/protocol/capability/adapter/registry/modal/reference changes.
- A UXP namespace constant or native `photoshop.constants.PSLayerKind` requirement.
- Mapping `PSLayerKind` to `LayerKind` or changing layer signatures.
- Renaming Adobe's symbol or lower-camel members.
- Committing `test/uxp-plugin/webview/generated/` output.
- Coverage report or public documentation updates.

## Interface and Contract Changes

| Surface | Additive contract |
| --- | --- |
| Shared runtime | `PSLayerKind` exact 14-member numeric table |
| Shared type | `PSLayerKindValue` values 0 through 13 |
| Aggregate | `PhotoshopConstants.PSLayerKind` |
| Namespace type | `PhotoshopConstantsNamespace[PSLayerKind]` |
| WebView direct | `photoshop.PSLayerKind` |
| WebView aggregate | `photoshop.constants.PSLayerKind` |
| Ordering | Existing 102 keys unchanged; new key appended |
| Transport | None; synchronous access sends no RPC |

There are no removals, signature changes, consumer-visible errors, persistence changes, or migrations.

## Failure Handling

- Source read/parse failures terminate generation without writing output.
- Missing `PSLayerKind`, duplicate selections/names, unsupported names, or non-literal initializers fail with source and enum/member context.
- `--check` fails with the existing stale-output instruction when committed output differs.
- Contract drift produces enum/member-specific failures; accidental RPC fails through the throwing fake client.
- No retry, partial remote failure, or migration behavior applies. Reverting the four-file implementation delta fully rolls back the feature.

## Implementation Plan

1. Extend the contract test baseline and counts; verify it fails against the current 102-table output.
2. Refactor the generator around the ordered source manifest, add validation, preserve ordering, and update provenance.
3. Run `pnpm generate:photoshop-constants`; never hand-edit its output.
4. Add numeric type compatibility, exact-name assertions, and public-shape count/value/identity checks.
5. Run focused and repository gates, exclude generated CDP fixture files, and confirm no WebView runtime or UXP host production file changed.

## Testing Strategy

The highest reliable seam is `test/contract/photoshop-constants.test.mjs` against the built namespace with a throwing fake RPC client. Required evidence:

- `node scripts/generate-photoshop-constants.mjs --check` reports 103 current tables.
- The focused contract test proves exact values, 103/104 counts, identity, and no RPC/Promise behavior.
- `pnpm typecheck` proves the numeric Adobe/generated union and exhaustive names.
- `pnpm test:static`, `pnpm build`, and `pnpm test:contract` pass.
- When Photoshop/UXP is available, run the existing `photoshop.public-shape` CDP case. Because behavior is fully observable at the contract seam, lack of a real host is reported as unrun and does not justify adding host work.

No UXP adapter fake, host diagnostic, document fixture, or destructive state is needed.

## Dependencies and Landing Order

RFC-0004 established Shared constants and direct WebView exposure. RFC-0007 established the compile-time, contract, and CDP seams. ADR-0006 remains the governing accepted decision.

Land this RFC as one change after making the code-bearing baseline available on an isolated implementation branch. Generator logic and generated output must land together. Documentation may follow separately and does not block implementation.

## Risks and Trade-offs

- **Baseline availability:** `origin/main` lacks the implementation while the supplied local repository is dirty. Implementation is operationally blocked until a safe code-bearing branch/worktree exists.
- **Declaration layout:** `PSLayerKind` is `@ignore` and outside `Constants.d.ts`; explicit approved selection avoids treating every class-file enum as automatically public.
- **Host variance:** making native Photoshop expose this enum is rejected because it would convert a Shared value into a host dependency.
- **Generator generality:** a recursive crawler is shorter but could publish future symbols without review; the explicit selector is safer.
- **Manual transcription:** a smaller diff would split source ownership and weaken `--check`; generator ownership is retained.
- **Ordering:** global sorting would reorder 102 public keys; appending preserves compatibility for enumeration.

## Architecture Review Handoff

The Architecture Reviewer must verify:

- the exact `PSLayerKind` spelling, lower-camel member names, values 0–13, identity guarantees, and 103/104 counts;
- explicit `Layer.d.ts` selection preserves ADR-0006's on-demand rule;
- exhaustive type checks include the separately declared enum rather than being weakened;
- the native Photoshop snapshot remains a subset check and is not a dependency for this Shared value;
- generated ownership, deterministic ordering, stale-output detection, and failure-before-write are adequate;
- implementation stays within the generator, generated Shared constants, contract test, and colocated type/CDP test;
- the code-bearing baseline risk is resolved before implementation begins.
