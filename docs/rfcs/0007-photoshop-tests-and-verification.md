# RFC-0007: Photoshop module tests and verification

Status: ready-for-agent
Source: notes/photoshop-module-spec.md (§1 "代价", §5, §7, §8 gate), approved plan "Photoshop 模块开发计划（核心对象全量）" (测试 / 验证顺序)
Related: RFC-0004 (shared protocol & constants), RFC-0005 (WebView module), RFC-0006 (UXP host adapter), test/TESTING.md, test/static/check-boundaries.mjs, CONTEXT.md

## Summary

Prove the Photoshop module works and stays consistent. Two test layers: (1) **static consistency** tests that run without Photoshop — each RemoteClass's descriptor tables match its `declare` members, and the transcribed `as const` constants stay compatible with the Adobe `@shared-types/photoshop` enums; and (2) **co-located CDP cases** (`photoshop.` prefix) that exercise the real bridge against a live Photoshop host. This RFC also owns the delivery gate: `typecheck` → `test:static` → `build` → CDP tsc/`test:uxp` → self-review → local commit.

## Context & Problem

The descriptor-table + `declare` design (ADR 0002) has a known cost: property names are written twice (runtime table + type declaration), which silently drifts unless a test locks them together (spec §1 explicitly calls for this). The on-demand constant transcription (ADR 0006) has the same risk: hand-copied `as const` values can diverge from Adobe's real enum values. And the bridge's behavior — async property reads, read-your-writes, value objects, collection identity, mutating round-trips, batch — is only truly validated against a real Photoshop host over the actual CDP transport. This RFC delivers the tests that catch drift cheaply (static, no PS) and the tests that prove behavior (CDP, real PS), plus the verification sequence for handoff.

## Design

**Static consistency (no Photoshop, runs in normal `test`/`test:static` context).**

- *Descriptor ↔ declare lock:* for `WebviewPsDocument` and `WebviewPsLayer`, assert `Object.keys(properties) ∪ Object.keys(methods)` equals the class's `declare` member key set. Since `declare` members emit no runtime code, the key set is captured via a type-level exhaustiveness assertion (a `satisfies`/mapped-type check that fails to compile if the two sets differ), complemented by a runtime assertion over the descriptor tables. This is the guard the spec mandates for the double-write cost.
- *`batchSet` writability:* a `// @ts-expect-error` test confirming that passing a read-only property to `batchSet` is a compile-time error (writable-only partial).
- *Constant compatibility:* assert each transcribed `as const` enum is assignable to / equals the corresponding Adobe enum type. **Blocker to resolve here:** the `@shared-types/photoshop` alias resolves to `src/shared/types/photoshop/src/*`, which does not exist; the real enums live in the ambient `declare module 'photoshop'` inside `internal/dom/Constants.d.ts`, and they are `enum`s (type-only at our call site). The compatibility strategy must therefore be chosen during implementation: options are (a) fix/point the alias at the real bucket file so the enum *types* are importable and assert `typeof LayerKind[keyof …]` is assignable to the Adobe value-union; (b) if the enums cannot be cleanly imported as types, assert against a locally-derived value-union extracted from the ambient module; or (c) a lighter structural check (member-name presence + value equality) if neither type path is reachable. Pick the strongest option that actually compiles; document the choice inline.

**Co-located CDP cases (`photoshop.test.ts`, real Photoshop via `test:uxp`).** Defined with `defineWebviewCdpCases([...])`, each case name carrying the `photoshop.` module prefix (required by `checkWebviewCdpCaseNames`/`checkCdpCaseOwnership`), following the `fs.test.ts` convention (`bridge.ensureConfigured()`, `assert.functions`, cleanup):

- `photoshop.public-shape` — namespace, `app`, and the six constants exist.
- `photoshop.document-read` — `activeDocument` read-only scalars (`id`/`name`/`width`/`height`).
- `photoshop.layer-read-write` — read `name`/`opacity`, write `opacity`, then read-your-writes verifies the new value.
- `photoshop.layer-bounds-value` — `bounds` is a plain six-field object with no methods.
- `photoshop.layers-collection` — `length`/`[index]`/iteration/`getByName`; element `===`, container `!==`.
- `photoshop.identity-dedup` — resolving the same id twice yields `===`.
- `photoshop.layer-mutating` — `createLayer`/`duplicate`/`delete` round-trip.
- `photoshop.batch-get-set` — `batchGet` reads multiple props in one RPC; `batchSet` sets multiple writable props; read-only prop rejected at compile time (`// @ts-expect-error`).

**Verification gate (delivery order, each a hard gate).**
1. `pnpm typecheck`
2. `pnpm test:static` (boundaries, layout, import rules, CDP case names/ownership)
3. `pnpm build`
4. CDP-involved: `pnpm exec tsc -p tsconfig.cdp-webview.json` + `pnpm test:uxp` (needs a real Photoshop host; if unavailable, hand off with an explicit note that `test:uxp` is unrun and why).
5. `code-review` self-review to no criticals → `code-commiter` **local** commit (no push).

## Scope

**In scope**
- Static consistency tests: descriptor↔declare lock (Document + Layer), `batchSet` writability `@ts-expect-error`, constant↔Adobe-enum compatibility (with the alias/enum-import strategy resolved).
- Co-located `photoshop.test.ts` CDP cases (the eight above), prefixed and owned correctly.
- Executing and reporting the five-step verification gate; producing the local commit.

**Out of scope**
- Implementing the module itself — RFC-0004/0005/0006 (this RFC only tests and verifies them).
- Pushing, opening a PR, or any remote action — explicitly a local commit only.
- New CDP infrastructure — reuse `defineWebviewCdpCases` and the `fs.test.ts` conventions.

## Interface / Contract changes

None. This RFC adds tests and runs the verification pipeline; it introduces no public surface.

## Implementation plan

1. Add the descriptor↔declare consistency test for `WebviewPsDocument` and `WebviewPsLayer` (type-level exhaustiveness + runtime table assertion).
2. Add the `batchSet` writable-only `// @ts-expect-error` test.
3. Resolve the constant-compatibility strategy (alias fix vs local value-union vs structural) and add the compatibility assertions for all six enums; document the chosen approach inline.
4. Author `photoshop.test.ts` with the eight `photoshop.`-prefixed CDP cases via `defineWebviewCdpCases`, following `fs.test.ts` structure and cleanup.
5. Run the gate in order: `pnpm typecheck`, `pnpm test:static`, `pnpm build`, then `pnpm exec tsc -p tsconfig.cdp-webview.json` and (if a PS host is available) `pnpm test:uxp`.
6. `code-review` to no criticals; `code-commiter` local commit (no push). If `test:uxp` could not run, state so in the handoff.

## Testing

This RFC *is* the testing RFC; its own success criteria are: the static tests fail loudly on any descriptor/declare or constant drift (verify by temporarily introducing a mismatch and seeing it caught, then reverting), and the CDP cases pass against a real Photoshop host (or are demonstrably well-formed and type-check via the CDP tsc project when no host is available).

## Dependencies

RFC-0005 (WebView module) and RFC-0006 (UXP host adapter) must land first — the tests exercise their surfaces. RFC-0004 is transitively required (constants under compatibility test).

## Open questions

- The constant-compatibility assertion path depends on how `@shared-types/photoshop` can be made to yield the Adobe enum *types* (see Design). This must be resolved during implementation; the RFC allows a documented fallback (local value-union or structural check) if the alias/type import proves unreachable.
