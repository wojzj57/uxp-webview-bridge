# UXP WebView Bridge Testing Standards

This package uses three test gates:

- **Static Test Gate**: repository structure, type boundaries, public exports, and module symmetry without starting UXP or WebView.
- **Contract Test Gate**: bridge protocol, errors, capabilities, registry dispatch, and mockable adapter behavior in Node or controlled mocks.
- **UXP CDP Test Gate**: behavior that requires a real UXP plugin, real WebView message bridge, or real Photoshop/UXP host API.

## CDP Package Boundary

Run `pnpm build` before UXP CDP tests. The fixture plugin must consume the built package output and public subpath exports, not TypeScript source or private internal paths.

The WebView harness uses the public WebView API:

```ts
import { configWebviewBridge, fs, os, path, uxp } from "uxp-webview-bridge/webview";
```

The UXP fixture uses the public UXP API:

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";
```

Do not import internal runtime classes, adapters, registries, or `src` files from CDP cases. CDP case modules receive public WebView namespaces through the harness-injected `bridge` context instead of importing package entrypoints themselves.

## Static Gate

The static gate should be an explicit script:

```txt
test/static/check-boundaries.mjs
```

Expose it from `package.json`:

```json
{
  "test:static": "node test/static/check-boundaries.mjs"
}
```

The first version of `test:static` must check:

- `src/webview` does not import from `src/uxp`
- `src/uxp` does not import from `src/webview`
- `src/webview/index.ts` exports `configWebviewBridge`, `fs`, `os`, `path`, and `uxp`
- `src/uxp/index.ts` exports `configUxpBridge`
- deprecated setup APIs are not exported or reintroduced
- `src/webview/uxp-api/modules/*` and `src/uxp/uxp-api/modules/*` directories are symmetric
- `src/webview/photoshop-api/modules/*` and `src/uxp/photoshop-api/modules/*` directories are symmetric when those roots exist
- production `src` files do not import `@test/*`
- colocated WebView CDP tests do not import Node APIs or value-import local implementations
- colocated WebView CDP case names use their module prefix
- module namespace cases do not live in `test/cdp/cases`

Keep `pnpm typecheck` as a separate gate. Do not hide TypeScript checking inside `test:static`.

## Contract Gate

The first contract gate should use Node's built-in test runner:

```txt
test/contract/**/*.test.mjs
```

Expose it from `package.json`:

```json
{
  "test:contract": "pnpm build && node --test test/contract/**/*.test.mjs"
}
```

Use `node:test` and `node:assert/strict`. Do not add a third-party test framework until the repository needs snapshots, complex mocking, coverage integration, or custom concurrency controls.

The contract gate should cover protocol behavior, capability decisions, registry dispatch, mock `postMessage` flows, timeout/error mapping, and adapter behavior that does not require a real UXP host. Contract tests may import built package output, so `test:contract` builds first.

## Test Scripts

Use these top-level script names:

```json
{
  "test:static": "node test/static/check-boundaries.mjs",
  "test:contract": "pnpm build && node --test test/contract/**/*.test.mjs",
  "test": "pnpm test:static && pnpm typecheck && pnpm test:contract",
  "test:uxp": "pnpm build && node test/runner/run-cdp-auto.mjs",
  "uxp:open-devtools": "uxp-cli open-devtools --plugin-path ./test/uxp-plugin"
}
```

`pnpm test` is the fast local gate and must not require Photoshop or UXP automation. `pnpm test:uxp` is the single public real UXP/CDP gate: it builds, prepares the fixture, starts `uxp-cli create-cdp-url`, parses the URL, runs the requested case or suite, and stops the helper process. Keep lower-level runner scripts as implementation details, not package scripts.

The CDP runner does not reload the UXP panel by default because UXP's CDP `Runtime.evaluate` can hang when evaluation triggers `location.reload()`. Use `--reload` only as a manual debugging option.

## CDP URL Ownership

Use the single public auto wrapper for CDP URL ownership:

```powershell
pnpm test:uxp
```

Before starting `uxp-cli create-cdp-url`, the auto wrapper stops stale UXP DevTools helper processes using ports `14000-14100` to recover from old helper instances. It then parses the printed WebSocket URL, passes it to the internal CDP runner, and shuts the helper down. Override that range with `UXP_DEVTOOLS_PORT_RANGE` only if the underlying CLI changes its service port range.

## CDP Cases

Bridge-level CDP cases are immediate `.mjs` files under `test/cdp/cases`:

```txt
test/cdp/cases/bridge.ping.mjs
test/cdp/cases/bridge.remote-error-shape.mjs
```

The runner executes all case files by default and still allows one case to run directly for debugging:

```powershell
pnpm test:uxp
pnpm test:uxp -- --case os.platform
```

WebView module CDP cases live next to the WebView module as `src/webview/**/*.test.ts`:

```txt
src/webview/uxp-api/modules/os/os.test.ts
src/webview/uxp-api/modules/fs/fs.test.ts
src/webview/uxp-api/modules/uxp/uxp.test.ts
src/webview/uxp-api/global-members/path/path.test.ts
```

Colocated test files export a default `defineWebviewCdpCases([...])` array from `@test/cdp/webview-cases.js`. Case names are global and must include the module prefix, such as `os.platform` or `fs.public-shape`.

Example:

```ts
import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

export default defineWebviewCdpCases([
  {
    name: "fs.text-file-roundtrip",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();

      const filePath = `plugin-data:/example-${Date.now()}.txt`;

      try {
        await bridge.fs.writeFile(filePath, "hello", { encoding: "utf-8" });
        const value = await bridge.fs.readFile(filePath, { encoding: "utf-8" });

        assert.equal(value, "hello", "fs.readFile should return written text.");
        return { filePath };
      } finally {
        try {
          await bridge.fs.unlink(filePath);
        } catch {
          // Best-effort cleanup; assertions own pass/fail.
        }
      }
    }
  }
]);
```

Colocated WebView CDP tests must:

- test through `ctx.bridge`, not by importing package entrypoints or local implementation files
- avoid Node APIs such as `node:fs`, `node:path`, `fs`, and `path`
- use `import type` only when they need local types
- use best-effort cleanup for filesystem paths, documents, resource handles, and descriptors
- use `skip(reason, diagnostics?)` when the runtime environment cannot support the case

The auto runner copies bridge case files into the WebView fixture, compiles colocated WebView module cases, and generates `test/uxp-plugin/webview/generated/case-registry.js`. Generated fixture files are not committed.

## Assertion Boundary

Case assertions belong either in bridge-level files under `test/cdp/cases` or colocated WebView module files under `src/webview/**/*.test.ts`. The WebView harness loads generated case registry entries, injects a test context, and standardizes results. The UXP plugin fixture should configure the bridge host and expose only necessary diagnostics; the CDP runner should select all cases or one case, poll results, handle timeout, and print structured output.

If a case needs to observe host-side facts, expose test diagnostics from `test/uxp-plugin` and include them in the case `diagnostics`.

Bridge-level `test/cdp/cases/*.mjs` files export one default function:

```js
export default async function bridgePing({ bridge, assert }) {
  assert.ok(typeof bridge.ensureConfigured === "function", "bridge.ensureConfigured must be available.");

  return { ok: true };
}
```

Colocated `src/webview/**/*.test.ts` files export a default `defineWebviewCdpCases([...])` array. Each entry has a globally unique `name` and a `run(context)` function.

Use `skip(reason, diagnostics?)` when the runtime environment cannot support a case. Skipped cases do not fail a suite.

## Result Format

Each CDP case must report stable JSON:

```ts
{
  id: string;
  caseName: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  result?: unknown;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string;
    operationId?: string;
    remoteName?: string;
    remoteMessage?: string;
  };
  diagnostics?: Record<string, unknown>;
}
```

Default all-case output must aggregate case results:

```ts
{
  suiteName: "all";
  status: "passed" | "failed";
  durationMs: number;
  cases: CaseResult[];
}
```

## CDP Coverage Boundary

Put behavior in CDP tests when it requires a real UXP plugin, real WebView message bridge, or real Photoshop/UXP host API:

- bridge configuration and communication through the real WebView message bridge
- public WebView namespaces calling UXP side host adapters
- origin and source validation under real WebView message events
- UXP-only APIs such as Photoshop modal execution, `batchPlay`, imaging, and resource handles
- UXP filesystem behavior that needs real plugin URL schemes such as `plugin-data:/`
- WebView runtime restrictions that mocks cannot prove

Do not use CDP as the primary coverage for static or mockable behavior:

- public export shape, runtime-boundary imports, and symmetric module directories
- operation IDs, protocol envelopes, registry dispatch, and error normalization
- capability matrix combinations and adapter branches that can be driven with mocks
- client timeout, cancellation, and local response mapping behavior

## Fixture Diagnostics

The UXP fixture may expose test-only diagnostics when a case needs to observe host-side facts that are not part of the package API. Keep those diagnostics inside `test/uxp-plugin`, name them with a `__UXP_BRIDGE_TEST_` prefix, and report them through case `diagnostics`.

Useful diagnostics include observed message origins, resource handle counts, modal call observations, and last bridge envelopes. Do not add diagnostic-only branches to `src`; if production observability is needed, design it as a separate public capability.

## Initial Case Set

The initial CDP case set is:

- `bridge.ping`: proves the CDP runner, UXP panel, WebView harness, and result return path are alive.
- `bridge.public-api-loads`: imports `configWebviewBridge`, `fs`, `os`, `path`, and `uxp` from the built WebView subpath and confirms the public entrypoint shape.
- `bridge.config-connects`: configures both sides through public APIs and completes a real request/response.
- `os.platform`: calls the public `os` namespace through the real UXP adapter from the colocated `os.test.ts`.
- `uxp.versions`: reads the public `uxp.versions.uxp` and `uxp.versions.plugin` Promise properties through the real UXP adapter.
- `fs.public-shape`: confirms the public WebView `fs` namespace shape from the colocated `fs.test.ts`.
- `fs.text-file-roundtrip`: writes, reads, stats, and removes a real `plugin-data:/` text file.
- `fs.directory-operations`: creates a real plugin-data directory and verifies readdir, rename, copyFile, lstat, and cleanup.
- `fs.file-descriptor-binary-roundtrip`: verifies open, read, write, close, and binary transport through a real file descriptor.
- `bridge.remote-error-shape`: triggers a real remote error and confirms the WebView side receives the bridge remote error fields.

Photoshop cases may participate in the default all-case run only when every case that needs document state creates its own minimal fixture document through the public WebView API and closes it without saving in `finally`. A case that cannot create an isolated document must call `skip(...)` before reading or mutating any user document.

## Failure Strategy

CDP runs independent cases to completion by default. A failed case should not prevent later independent cases from running.

Stop only for run-level fatal errors such as fixture initialization failure, WebView readiness timeout, or CDP disconnection. If a case depends on unavailable runtime state, return `skip(reason, diagnostics?)`.

Support `--fail-fast` for local debugging, but do not make it the default CI behavior.

## Photoshop Fixture State

Photoshop CDP cases must not depend on the user's current Photoshop document state. Prefer a per-case fixture helper over an ambient `activeDocument`; setup should declare prerequisites such as `requiresPhotoshopDocument: true` only if a future suite-level fixture layer owns creation and teardown.

The fixture setup should create the minimum document and layer state needed by the suite, and teardown should close test documents without saving. Cases must not modify user documents. If the current Photoshop host cannot support a required setup capability, mark the affected case as `skipped` and include diagnostics.

The default all-case run may create Photoshop documents only through this fixture-owned lifecycle. Teardown failure is a case failure because an unclosed test document is material leaked state.
