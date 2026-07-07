# Generic `RemoteClass` base with descriptor table + `declare` types for stateful DOM objects

Stateful Photoshop DOM objects (Document, Layer, Layers, ...) are numerous and share identical bridge plumbing: hold a remote reference, read properties async, queue property writes, call remote methods. Rather than hand-writing that plumbing per class (as the XMP module does), we introduce a generic WebView-side `RemoteClass` base. Subclasses such as `PsLayer` provide a static **descriptor table** (property names + writability + nested reference kind, plus method names); the base class reads it at runtime via `Object.defineProperty` to generate getters/setters and to power `batchGet`/`batchSet`. All communication lives in the base.

Because `Object.defineProperty` is invisible to the TypeScript compiler, user-facing type hints cannot come from the descriptor table alone. Each subclass therefore also `declare`s its property members (`declare name: Promise<string>`, `declare readonly id: Promise<number>`). A static test asserts the `declare`d members and the descriptor-table keys stay in sync. Properties are thus named twice — once in the runtime table, once in the type declaration — which is the irreducible cost of combining runtime-injected members with static typing.

## Considered Options

- **Descriptor table + `declare` (chosen):** Communication centralized in the base; subclasses are near-pure declarations; `batchGet`/`batchSet` derive from a single runtime source of truth (the table); full user type hints via `declare`. Cost: property names appear twice, guarded by a static consistency test.
- **Hand-written getters/setters per class (XMP-style), base provides only `get`/`set`/`call` primitives:** Type hints come for free, but heavy boilerplate (3–6 lines per property) and `batchGet`/`batchSet` still need a separate property-name list — so names are written twice anyway, with more code.
- **`Proxy`-based dynamic interception:** Least code, no declarations. Rejected: TypeScript cannot express the members (no completion/checking) and it violates the AGENTS.md intent that every remote property/method be visible in code.
- **Generic mapped-type inference (single source of truth):** Attempts to derive both runtime and compile-time members from the table. Rejected: TS cannot fold constructor-injected members back into a subclass instance type without abandoning the `class X extends RemoteClass` form and producing opaque type errors.

## Consequences

- AGENTS.md forbids generating a WebView namespace dynamically from a method-name array, to keep params/returns/serialization/read-write behavior visible in code. This ADR is a **scoped extension**, not a violation: the descriptor table makes writability and nested reference kinds explicit, and the `declare` block makes the typed surface explicit. The rule stands unchanged for stateless namespaces (os, fs, path); the descriptor-table pattern is permitted only for stateful `RemoteClass`-derived DOM objects.
- Every `RemoteClass` subclass must ship a static test asserting descriptor-table keys === `declare`d member keys, or drift will silently break `batchGet`/`batchSet`.
- Getters return `Promise<T>`; a getter and its same-named setter may have different types (`get name(): Promise<string>` vs `set name(v: string)`), expressing "read back a Promise, write a sync value that is queued".
- Because getters return Promises, code cannot use property values directly in arithmetic/string ops the way Adobe's synchronous DOM examples do (`layer.opacity - 10` must become `(await layer.opacity) - 10`). Form parity with Adobe's DOM is approximate, not exact.
