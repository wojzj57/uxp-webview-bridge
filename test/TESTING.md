# UXP WebView Bridge Testing Standards

This package uses three test gates:

- **Static Test Gate**: repository structure, type boundaries, public exports, and module symmetry without starting UXP or WebView.
- **Contract Test Gate**: bridge protocol, errors, capabilities, registry dispatch, and mockable adapter behavior in Node or controlled mocks.
- **UXP CDP Test Gate**: behavior that requires a real UXP plugin, real WebView message bridge, or real Photoshop/UXP host API.

## CDP Package Boundary

Run `pnpm build` before UXP CDP tests. The fixture plugin must consume the built package output and public subpath exports, not TypeScript source or private internal paths.

The WebView harness uses the public WebView API:

```ts
import { configWebviewBridge, fs, os, photoshop, uxp } from "uxp-webview-bridge/webview";
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
- `src/webview/index.ts` exports `configWebviewBridge`, `os`, `fs`, `uxp`, and `photoshop`
- `src/uxp/index.ts` exports `configUxpBridge`
- deprecated setup APIs are not exported or reintroduced
- `src/webview/uxp-api/modules/*` and `src/uxp/uxp-api/modules/*` directories are symmetric
- `src/webview/photoshop-api/modules/*` and `src/uxp/photoshop-api/modules/*` directories are symmetric when those roots exist

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

CDP cases are immediate `.mjs` files under `test/cdp/cases`:

```txt
test/cdp/cases/os.platform.mjs
test/cdp/cases/os.release.mjs
```

The runner executes all case files by default and still allows one case to run directly for debugging:

```powershell
pnpm test:uxp
pnpm test:uxp -- --case os.platform
```

Each immediate `test/cdp/cases/*.mjs` file is automatically available as a runnable case. The case name is the filename without `.mjs`, so `test/cdp/cases/os.platform.mjs` is run as `os.platform`.

The auto runner copies case files into the WebView fixture and generates `test/uxp-plugin/webview/generated/case-registry.js`. Generated fixture files are not committed.

## Assertion Boundary

Case assertions belong in modular files under `test/cdp/cases`. The WebView harness loads generated case registry entries, injects a test context, and standardizes results. The UXP plugin fixture should configure the bridge host and expose only necessary diagnostics; the CDP runner should select all cases or one case, poll results, handle timeout, and print structured output.

If a case needs to observe host-side facts, expose test diagnostics from `test/uxp-plugin` and include them in the case `diagnostics`.

Case modules export one default function:

```js
export default async function osPlatform({ bridge, assert, skip, payload }) {
  bridge.ensureConfigured();

  const platform = await bridge.os.platform();
  assert.nonEmptyString(platform, "os.platform()");

  return { platform };
}
```

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
- UXP-only APIs such as plugin-scheme filesystem access, Photoshop modal execution, `batchPlay`, imaging, and resource handles
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
- `bridge.public-api-loads`: imports `configWebviewBridge`, `os`, `fs`, `uxp`, and `photoshop` from the built WebView subpath and confirms the public entrypoint shape.
- `bridge.config-connects`: configures both sides through public APIs and completes a real request/response.
- `os.platform`: calls the public `os` namespace through the real UXP adapter.
- `fs.plugin-data-roundtrip`: writes, reads, and removes a small text file under `plugin-data:`.
- `bridge.remote-error-shape`: triggers a real remote error and confirms the WebView side receives the bridge remote error fields.

Keep Photoshop coverage out of the initial all-case default until the fixture can create and clean up document state safely.

## Failure Strategy

CDP runs independent cases to completion by default. A failed case should not prevent later independent cases from running.

Stop only for run-level fatal errors such as fixture initialization failure, WebView readiness timeout, or CDP disconnection. If a case depends on unavailable runtime state, return `skip(reason, diagnostics?)`.

Support `--fail-fast` for local debugging, but do not make it the default CI behavior.

## Photoshop Fixture State

Photoshop CDP cases must not depend on the user's current Photoshop document state. Photoshop fixture setup should declare prerequisites such as `requiresPhotoshopDocument: true` when that layer exists.

The fixture setup should create the minimum document and layer state needed by the suite, and teardown should close test documents without saving. Cases must not modify user documents. If the current Photoshop host cannot support a required setup capability, mark the affected case as `skipped` and include diagnostics.

The default all-case run should not create Photoshop documents until Photoshop fixture setup and teardown are implemented.
