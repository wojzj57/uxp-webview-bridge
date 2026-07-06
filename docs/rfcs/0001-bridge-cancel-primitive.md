# RFC-0001: `bridge.cancel` cancellation primitive

Status: ready-for-agent
Source: Grilling/domain-modeling session on forwarded WebView fetch (2026-07-06)
Related: ADR docs/adr/0001-bridge-cancel-envelope.md

## Summary

Add a first-class, fire-and-forget `bridge.cancel` message to the core RPC protocol so a WebView can abort an in-flight host operation by its `operationId`. This is a reusable RPC-layer primitive owned by the transport, not tied to any single module. It is the foundation that lets forwarded fetch (RFC-0002) honor `AbortSignal` end-to-end.

## Context & Problem

The bridge protocol is today strictly request → single response: a `bridge.call` produces exactly one `bridge.success` or `bridge.error`, correlated by `operationId`. There is no way for the WebView to tell the host "stop working on operation X." Any long-running operation — starting with a forwarded fetch — therefore cannot be cancelled once dispatched.

We chose an RPC-layer cancellation primitive over a module-local `abort` method because the RPC layer already owns `operationId`s and the pending-operation map, and a shared primitive can serve any future long-running module. See ADR-0001 for the full trade-off.

## Design

Introduce a new request envelope type `bridge.cancel` carrying only an `operationId`. It is fire-and-forget: the WebView does not await an acknowledgement, and no dedicated response envelope is defined for it.

Host behavior:

- For every accepted `bridge.call`, the host associates an `AbortController` with that `operationId` while the operation is in flight, and passes the controller's `AbortSignal` into the dispatch context so module adapters can observe cancellation.
- On receiving `bridge.cancel` for a known in-flight `operationId`, the host aborts the associated controller. A `bridge.cancel` for an unknown or already-settled `operationId` is a harmless no-op.
- When an aborted operation settles, it resolves through the normal channel — typically a `bridge.error` describing the abort. The original `bridge.call` promise on the WebView therefore rejects as usual; there is no separate "cancel acknowledged" signal.
- The controller entry is cleaned up when the operation settles (success, error, or abort).

WebView behavior:

- The RPC client exposes `cancel(operationId)`, which posts a `bridge.cancel` envelope and does not wait for a reply.
- Origin validation and message plumbing for `bridge.cancel` follow the exact same rules as `bridge.call`.

Modules that do not opt into cancellation are unaffected: they simply ignore the `AbortSignal` in their dispatch context, and a `bridge.cancel` targeting them aborts a signal nobody listens to.

## Scope

**In scope**
- New `bridge.cancel` request envelope type in the shared protocol.
- Host-side per-operation `AbortController` lifecycle and `bridge.cancel` routing.
- Exposing an `AbortSignal` to module adapters through the dispatch context.
- WebView RPC client `cancel(operationId)`.

**Out of scope**
- Any module actually consuming the signal — the forwarded fetch adapter that listens to it lives in RFC-0002.
- A response/acknowledgement envelope for cancellation (deliberately fire-and-forget).

## Interface / Contract changes

| Change | Detail |
| --- | --- |
| New envelope type | `bridge.cancel` added to the request envelope union: `{ type: "bridge.cancel", operationId }`. No payload beyond `operationId`. |
| Dispatch context | The adapter dispatch context gains an `AbortSignal` field, valid for the duration of the operation. |
| WebView RPC client | New method `cancel(operationId): void` — posts `bridge.cancel`, returns nothing. |
| Error surface | Aborted operations settle as a `bridge.error` (existing `BridgeRemoteError` shape) indicating abort; no new error envelope type. |

## Implementation plan

1. Add the `bridge.cancel` envelope type to the shared protocol request union, keyed by `operationId` with no additional payload.
2. In the host, maintain a map from in-flight `operationId` to `AbortController`; register on `bridge.call` accept, delete on settle.
3. Thread the controller's `AbortSignal` into the dispatch context passed to module adapters.
4. Route incoming `bridge.cancel` messages to `abort()` the matching controller; no-op if absent. Apply the same origin validation as `bridge.call`.
5. Add `cancel(operationId)` to the WebView RPC client that posts the envelope fire-and-forget.

## Testing

At the RPC host/client seam, asserting external behavior:

- A `bridge.cancel` for an in-flight operation causes the adapter's observed `AbortSignal` to become aborted, and the original call rejects with an abort error.
- A `bridge.cancel` for an unknown/settled `operationId` is a no-op (no throw, no effect on other operations).
- An operation whose adapter ignores the signal still completes normally after a `bridge.cancel`.
- Origin rules reject `bridge.cancel` from disallowed origins exactly as for `bridge.call`.

## Dependencies

None — foundational. Must land before RFC-0002.
