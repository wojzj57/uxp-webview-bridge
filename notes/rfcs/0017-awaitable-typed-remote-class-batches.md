# RFC-0017: Awaitable and typed RemoteClass property batches

Status: accepted
Source: interactive design decisions approved 2026-07-28
Depends on: the existing RemoteClass descriptor, remote-reference, result-decoding, write-queue, and type-specific Host adapter architecture
ADR required: Yes — see `notes/decisions/0001` through `0006`

## Summary

Make `batchGet` and `batchSet` guaranteed base capabilities of every WebView RemoteClass. A
non-empty batch uses exactly one type-specific Host RPC. Reads return a precisely typed complete
result; writes return `Promise<void>` that settles when Host execution completes. Descriptor tables
remain the runtime authority, and the UXP Host repeats all trust-boundary validation.

The repository already contains the broad runtime and Host shape for these methods. This RFC closes
the remaining contract gaps: awaitable writes, exact public types, input snapshots, empty-operation
behavior, deterministic Host ordering, complete pre-validation, non-transactional failure semantics,
and static enforcement that batching never degrades into multiple property calls.

## Domain boundary

The methods belong to RemoteClass and therefore appear on Photoshop and XMP RemoteObjects. They do
not belong to value objects or collection wrappers: those are local values with different identity
and lifecycle semantics.

A RemoteClass with no declared readable properties supports only `batchGet([])`. A type with no
declared writable properties supports only `batchSet({})`. These empty operations settle locally and
do not require meaningless Host protocol methods.

## Public API

Each public RemoteClass type defines resolved readable values and writable inputs separately:

```ts
interface LayerReadableProperties {
  id: number;
  name: string;
  bounds: Bounds;
  visible: boolean;
}

interface LayerWritableProperties {
  name: string;
  visible: boolean;
}

interface LayerBatchOperations {
  batchGet<K extends keyof LayerReadableProperties & string>(
    keys: readonly K[]
  ): Promise<{ [P in K]: LayerReadableProperties[P] }>;

  batchSet(
    properties: Readonly<Partial<LayerWritableProperties>>
  ): Promise<void>;
}
```

The concrete helper/type composition may be shared, but generated declarations must preserve each
RemoteClass's exact key and value types. A remote-reference property resolves to the canonical
RemoteObject instance in the result; a value-object property resolves to its plain value object; a
collection property resolves through its existing collection decoder. The result does not contain
nested property Promises merely because ordinary property getters are asynchronous.

There is no permissive `string[]` overload returning `Record<string, unknown>`. Dynamic strings must
be validated and narrowed to the applicable readable-key union. Runtime checks remain mandatory for
JavaScript consumers and type-system escape hatches.

No options or `AbortSignal` parameter is added in this version.

## `batchGet` semantics

At invocation, WebView copies the key array, validates every key against the descriptor table, and
removes duplicates while retaining first-occurrence order. An empty normalized list resolves to an
empty object without RPC.

A non-empty read enters the RemoteObject scheduler, waits for preceding writes on that object, and
sends exactly one configured, type-specific Host request. Host validates the reference, complete key
list, readable-property membership, and protocol shape before invoking a getter. It then reads each
property once and serializes it according to the Host-side result-kind table.

The operation either returns every requested field or rejects; it never returns partial results or
per-key success/error unions. A getter failure identifies the failing property. WebView decodes every
field with the same descriptor path used by an individual property read, preserving value conversion,
collection behavior, and RemoteObject identity deduplication.

The single request is an ordering and round-trip guarantee, not snapshot isolation. Reads occur
consecutively in one Host dispatch after preceding object writes, but external Host state may change.
Read-only batches do not enter Photoshop modal execution solely to simulate an atomic snapshot.

## `batchSet` semantics

The public method returns `Promise<void>`. Its Promise resolves only after Host execution completes
and rejects for local validation, transport, Host validation, decoding, modal, or native assignment
failure.

At invocation, WebView requires a plain or null-prototype property record. It reads only own,
enumerable string keys; arrays, built-in collection/value instances, and class instances are invalid
top-level maps. Inherited, symbol, and non-enumerable members are not protocol input. WebView copies
the map into a null-prototype record, validates that every key is declared writable, and begins full
transport encoding immediately. Mutating the caller's original map or nested values afterward cannot
change the queued request.

An empty map resolves locally without RPC. A non-empty map becomes one explicit scheduler write and
one configured, type-specific Host request. Later reads and methods wait for it to settle. Unlike a
queued JavaScript property setter, its error belongs solely to the returned Promise: once the caller
has caught a rejection, the next remote operation does not replay it. Ignoring a rejecting Promise
has ordinary JavaScript unhandled-rejection behavior.

Host validates all keys and decodes all values before the first mutation. It applies properties in
descriptor-table order, not caller object-key order. Photoshop mutations that require modal execution
share one modal scope for the batch; properties that do not require modal execution must not force
unrelated read behavior into a modal scope.

The batch is not a transaction. On native assignment failure, Host stops and rejects without trying
to restore earlier assignments. The error identifies the failing property, and callers must treat
earlier properties in descriptor order as potentially applied. Ordering dependencies belong in
separate awaited operations rather than one batch.

## Errors and security

WebView descriptor failures reject with `TypeError` before RPC. It does not fabricate an operation ID
or remote stack for local failures. Any Host-returned failure becomes `BridgeRemoteError` and retains
the normal remote name, message, stack, code, and `operationId`. No batch-specific error subclass is
added.

Host remains authoritative for origin, source, module capability, protocol method, reference type and
ownership, readable/writable membership, argument shape, and transport decoding. Photoshop and XMP
batch methods inherit their existing module capabilities. TypeScript declarations and WebView checks
are developer feedback, not security controls.

## Host protocol and configuration

The uniform API does not introduce a global `remote.batchGet` or `remote.batchSet` method. Descriptor
configuration continues mapping each property-bearing RemoteClass to type-specific calls such as
`layer.batchGet`, `document.batchSet`, or `xmp.dateTime.batchGet`.

RemoteClass configuration and static checks must require a real batch-get handler for a non-empty
readable property set and a real batch-set handler for a non-empty writable property set. Missing
configuration is a construction/static error, not a runtime fallback. A batch implementation must
never issue N individual getter or setter RPCs.

Protocol method allowlists, WebView/UXP module symmetry, and the prohibition on cross-runtime imports
remain unchanged. Shared code contains only transport-neutral types and validation helpers.

## Compatibility and migration

The package is currently private at version `0.0.1`. Existing calls that ignore the successful
`batchSet` return continue to run, but the public return type and failure observation change from
queued `void` behavior to an explicit Promise. All public Photoshop and XMP RemoteClass interfaces,
README examples, and tests must use or deliberately ignore the returned Promise.

Current `Record<K, unknown>` results migrate to exact mapped result types. Callers holding an
unrefined `string[]` must narrow it before calling. No wire-version fallback is added because batch
method names already exist for property-bearing implementations and mixed-version silent fallback
would violate the one-RPC contract.

## Implementation plan

1. Add reusable readable/writable batch type helpers and migrate every public RemoteClass interface
   to exact property maps and `Promise<void>` writes.
2. Refactor `RemoteOperationScheduler` to distinguish awaitable explicit writes from unawaitable
   property-setter writes: both form ordering barriers, but only setter failures are replayed by the
   next dependent operation.
3. Update RemoteClass to normalize and snapshot inputs synchronously, short-circuit empty batches,
   reject invalid keys through Promises, and require one configured RPC for every non-empty batch.
4. Make WebView encoding produce an invocation-time transport snapshot without weakening existing
   RemoteObject reference, value-object, collection, or binary-envelope handling.
5. Refactor each Host batch setter to validate and decode the complete request before mutation, then
   assign in canonical descriptor order under one modal scope where required. Standardize failing-key
   context for Host getter and setter errors.
6. Add static coverage that enumerates every RemoteClass subclass and proves property-bearing types
   configure matching type-specific Host batch methods and public types.
7. Update public documentation and examples without reintroducing deprecated setup or factory APIs.

## Testing strategy

### Static and type checking

- every RemoteClass public type contains both methods;
- literal tuples infer exact result keys and resolved values;
- unknown read keys, read-only writes, incorrect values, and plain `string[]` inputs fail type checking;
- propertyless/read-only types accept only their empty operations;
- every non-empty descriptor property set has a matching type-specific WebView and Host protocol path;
- no WebView/UXP boundary, module-symmetry, or deep-relative-import rule regresses.

### Contract

- one non-empty batch produces exactly one RPC and empty batches produce none;
- preceding setters flush before a batch read or write, and later operations wait for an explicit
  batch write;
- awaited write errors are not replayed, while queued property-setter errors retain existing replay
  behavior;
- input arrays/records and nested values are invocation-time snapshots;
- duplicate read keys invoke and decode one getter;
- local invalid keys reject with `TypeError`; Host failures preserve `BridgeRemoteError` metadata and
  identify the failing property;
- batch reads decode scalars, value objects, collections, nullable references, and identity-deduped
  RemoteObjects exactly like individual reads;
- Host completes validation and decoding before mutation, applies canonical order, stops on first
  native failure without rollback, and uses exactly one modal scope where required;
- a failed batch followed by a read exposes actual post-failure state rather than replaying the error.

### UXP/CDP

Use representative public WebView APIs rather than private classes. A fixture-owned Photoshop
document/layer case proves multi-property read, awaited multi-property write, read-after-write, and
cleanup. A representative reference/value-object batch verifies real decoding and identity. XMP
DateTime covers the non-Photoshop RemoteClass path when the host exposes XMP. Tests never mutate a
user document and skip only when the runtime prerequisite is unavailable.

Required completion gates are `pnpm typecheck`, `pnpm test:static`, `pnpm test:contract`, and
`pnpm build`; run the representative `pnpm test:uxp` cases when Photoshop/UXP is available.

## Out of scope

- transactional rollback or atomic snapshot isolation;
- caller-controlled property assignment order;
- per-property partial-success result structures;
- permissive string-key overloads;
- per-call cancellation;
- cross-object batches;
- batch methods on value objects or collection wrappers;
- a universal cross-type Host RPC or fallback to individual property calls.
