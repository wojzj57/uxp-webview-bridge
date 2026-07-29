# RFC-0016: Callback, modal, and bridge-session protocol

Status: implemented
Source: Photoshop Core gap implementation decisions approved 2026-07-28
Depends on: the existing bridge call/cancel/success/error protocol and Core 31-member parity baseline
ADR required: Yes — envelope vocabulary and session teardown are cross-module protocol decisions

## Summary

Add one runtime-neutral, bidirectional callback protocol shared by Photoshop Core notifications,
Action notifications, `Document.suspendHistory`, and `core.executeAsModal`. Every configured bridge
owns an explicit session. WebView callbacks cross the bridge as stable callback references; the UXP
host may invoke them and receive transport-safe results or structured errors. A public modal callback
may issue nested bridge calls without opening a second native modal scope.

This RFC records the approved non-negotiable behavior:

- bridge destruction is strongly asynchronous and awaited on both sides;
- only one public modal session may be active at a time;
- callback results use generic `T`, restricted to transport-safe values;
- listener add/remove operations are idempotent;
- each listener has a FIFO queue capped at 256 pending events;
- overflow unsubscribes the listener and reports through `onUnhandledError`;
- callback invocation timeout is 60 seconds;
- temporary-document maximum lifetime is 30 minutes.

## Motivation

The current request/response client can only resolve responses keyed by an operation ID. It cannot
represent a Host-to-WebView invocation, preserve function identity for later removal, or complete a
native modal callback while the WebView callback performs nested RPC. Local WebView destruction also
does not currently prove that Host-owned listeners and temporary documents were released.

Adding callback arguments to ordinary `bridge.call` payloads without session ownership would leak
listeners on disconnect. Opening another native `executeAsModal` for each nested mutation would risk
deadlock and would not preserve one Photoshop history/modal transaction. Both are rejected.

## Session lifecycle

Each `configWebviewBridge` / `configUxpBridge` pairing owns an isolated runtime scope. Callback IDs
are meaningful only to the `RpcClient` that created them, while listener registrations, modal
transactions, and temporary documents are owned by the paired `RpcHost`. A separate opaque
`modalSessionId` authorizes calls made from an active modal callback.

The public runtime contract is strongly asynchronous:

```ts
interface BridgeRuntime {
  destroy(): Promise<void>;
}
```

`destroy()` is idempotent. Its first call performs this ordered transition:

1. mark the local session as closing and reject new public calls;
2. stop delivering new callback invocations to user code;
3. send a session-destroy request and cancel locally pending ordinary calls;
4. Host unregisters native listeners, cancels queued callback work, deletes owned temporary
   documents, and requests cancellation of an active modal callback;
5. Host returns the release-all acknowledgement only after cleanup attempts settle;
6. WebView rejects any remaining pending callbacks and removes message listeners.

Later calls return the same destroy promise. A broken transport cannot provide the strong remote
acknowledgement; WebView rejects `destroy()` with a structured transport error, while Host timers and
session-close detection remain the cleanup backstop. Callers must not interpret a rejected destroy as
proof of Host cleanup.

## Callback references and envelopes

A callback argument is serialized as a runtime-neutral reference, never as function source:

```ts
interface BridgeCallbackReference {
  readonly kind: "bridge.callback.ref";
  readonly callbackId: string;
}
```

The final envelope names may follow the existing naming convention, but the protocol must express
these distinct messages:

- callback invoke: `callbackId`, unique `operationId`, arguments, and optional
  `modalSessionId`;
- callback success: the same operation ID and a transport-safe payload;
- callback error: the same operation ID and normalized remote name/message/stack/code;
- runtime release-all request/acknowledgement.

`operationId` identifies ordinary calls and individual callback deliveries. Unknown, released, or
malformed callback IDs fail closed and are never dispatched. A callback reference cannot cross a
runtime because the receiving `RpcClient` has no matching registry entry.

## Generic callback result

`executeAsModal` retains a generic result:

```ts
executeAsModal<T>(
  target: (context: RemoteExecutionContext, descriptor?: object) => Promise<T>,
  options: ExecuteAsModalOptions
): Promise<T>;
```

`T` may contain only values accepted by the bridge serializer: JSON-safe primitives and containers,
the bridge's binary envelopes, value-object envelopes, and valid remote-reference envelopes. Raw
functions, symbols, cyclic objects, native UXP objects, DOM nodes, and other unsupported instances
are rejected before a success envelope is sent. Callback errors preserve remote metadata and are
surfaced as `BridgeRemoteError` at the caller.

Class instances are not implicitly flattened merely because native Photoshop 24+ can return them
within one UXP realm. They require an already-defined bridge value/reference representation.

## Listener identity and idempotency

The WebView registry assigns one stable callback ID per live function identity. Core listener
identity is the tuple `(runtime, group, ordered events, callbackId)`.

- Adding an already-active tuple succeeds without a second native registration.
- Removing an active tuple unregisters it once and succeeds.
- Removing an absent or already-removed tuple also succeeds.
- The same function may be registered under different groups/event lists; those are distinct tuples.
- Destroy releases every tuple owned by the session even when user code omitted removal.

Native registration failure rolls back the tuple and callback reference. Native removal failure is
reported to the explicit caller; destroy records it in cleanup diagnostics and continues cleaning the
remaining resources.

## Event ordering, backpressure, and unhandled errors

Each listener owns a FIFO invocation queue. At most one invocation for that listener executes in the
WebView at a time, so delivery order matches Host enqueue order. Different listeners may progress
independently.

The maximum is 256 queued, not-yet-started invocations per listener. When enqueueing another event
would exceed the cap, Host must atomically:

1. unsubscribe the native listener;
2. mark the registration failed and discard its queued, not-yet-started invocations;
3. release its callback ownership when no other registration uses it;
4. emit one structured `ERR_BRIDGE_CALLBACK_BACKPRESSURE` notification to the WebView runtime;
5. invoke the configured `onUnhandledError(error)` hook.

Overflow is not silently lossy and does not keep the native listener active. Exceptions thrown by
`onUnhandledError` are isolated and must not re-enter the bridge or prevent cleanup.

## Callback timeout

Every Host-to-WebView callback invocation has a 60,000 ms timeout starting when the invocation is
posted. Success or error settles it once. On timeout, Host removes the pending invocation, ignores a
late response, and produces `ERR_BRIDGE_CALLBACK_TIMEOUT` with operation/callback metadata.

For notifications, a timeout is an unhandled listener error and is reported through
`onUnhandledError`; the listener remains registered unless it later overflows or user code removes
it. For `executeAsModal`, timeout rejects the modal target and begins modal cleanup. It must never be
converted into a successful `undefined` result.

## Single modal transaction and nested RPC

The bridge permits one active public `core.executeAsModal` transaction. Public calls are serialized
through a WebView FIFO queue, so a second unrelated modal request starts after the first settles.
Calling `executeAsModal` again from inside its own callback fails locally because waiting for a new
public modal transaction from the active transaction would deadlock.

The active transaction owns a `modalSessionId`. Callback invocations for its target and execution
context carry that ID. Ordinary calls made by that WebView callback carry the same modal ID. Host
dispatches permitted nested mutations inside the existing native modal callback and must not call
native `core.executeAsModal` again. Calls with an unknown, expired, or cross-session modal ID fail.

The remote execution context covers:

- live `isCancelled` state;
- replaceable/idempotently-cleared `onCancel` callback identity;
- `reportProgress`;
- `hostControl.suspendHistory` and `resumeHistory`;
- auto-close document registration and unregistration.

Modal completion waits for the WebView callback result/error and all required context cleanup. A
cancel signal is delivered at most once, but repeated native cancellation observations are safe.

## Temporary documents

Temporary documents are tracked by `(sessionId, documentID)` independently of persistent DOM remote
identity. Explicit deletion is idempotent for an already-deleted owned temporary document; a session
cannot delete another session's document.

Each tracked temporary document has a fixed 30-minute maximum lifetime measured from creation; use
does not refresh it. Host uses an actual timer/scheduler with a native delete finalizer; merely
dropping a JavaScript handle from a registry is insufficient. Expiry,
session destroy, and explicit deletion converge on one race-safe cleanup operation. Cleanup records
native errors and never adopts or deletes an ordinary user document.

If a create response becomes orphaned because the WebView times out or disconnects, Host ownership
was established before invoking native creation, so session teardown or the lease still deletes it.

## Security and validation

- Host retains origin, source, capability, method, and ownership validation.
- Callback IDs are scoped to one runtime registry; modal IDs are opaque capabilities scoped to one
  active transaction.
- Envelopes validate all IDs and payload shapes before registry lookup.
- A callback response may settle only an invocation currently awaiting that session/callback pair.
- Listener event names and groups are validated before native registration.
- Temporary document IDs and modal context operations are authorized by their owning registries.

## Testing strategy

### Static

- Pin the independent Adobe Core baseline at 31 members.
- Prove the partition is 28 non-callback members plus exactly
  `addNotificationListener`, `removeNotificationListener`, and `executeAsModal`.
- Require protocol, WebView public interface, and Host dispatch to match the 31-member baseline.
- Keep callback/session envelope types in Shared runtime-neutral code.
- Require `destroy(): Promise<void>` on both public runtime types.

### Contract

- round-trip generic transport-safe callback values and reject unsupported/cyclic values;
- preserve callback error metadata and invocation IDs;
- prove add/add/remove/remove idempotency and callback identity;
- prove per-listener FIFO ordering and independent listener progress;
- enqueue 257 blocked events and assert unsubscribe plus one `onUnhandledError` overflow;
- use a fake clock to prove the 60-second callback timeout;
- prove one modal session, nested RPC reuse, public-call queuing, nested-call rejection, cancellation,
  progress, history control, and cleanup ordering;
- prove async destroy waits for listener and temporary-document cleanup and is idempotent;
- use a fake clock and native finalizer spy to prove the 30-minute temporary-document lifetime.

### UXP/CDP

- use only fixture-owned disposable documents and close without saving in `finally`;
- prove notification registration/removal and destroy cleanup with fixture diagnostics;
- prove modal nested mutations execute under one observed native modal call;
- cover progress, cancel, callback error, suspend/resume history, and auto-close registration;
- never use the user's active document as fixture state.

## Rollout

1. Land the 31-member baseline and safe Photoshop document fixture.
2. Add session IDs, async destroy, callback references/envelopes, registries, and contract tests.
3. Deliver Core notification add/remove as the first tracer slice.
4. Reuse the callback infrastructure for Action listeners and `Document.suspendHistory`.
5. Deliver full `core.executeAsModal` only after nested RPC and single-modal tests pass.
6. Add temporary-document tracking with the native finalizer and 30-minute maximum lifetime.

No phase may weaken async teardown, silently drop overflow, serialize arbitrary class instances, or
claim modal parity while ignoring the execution context.

## Implementation record

Implemented on 2026-07-28 together with the complete 31-member Photoshop Core surface. Contract
coverage includes callback identity/error metadata, listener FIFO and overflow, removal/re-addition
serialization, modal nested RPC, Action notifications, `Document.suspendHistory`, strong teardown,
temporary-document ownership reset, and hostile WebView message origin/source rejection. The final
repository gates passed with 217 contract tests.
