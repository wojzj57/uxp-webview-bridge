# First-class `bridge.cancel` envelope for operation cancellation

To support end-to-end `AbortSignal` cancellation for forwarded fetch, we add a new fire-and-forget message type `bridge.cancel` to the core RPC protocol (alongside `bridge.call`), keyed by `operationId`, rather than implementing cancellation as a fetch-specific `abort` method. This makes cancellation a reusable primitive owned by the RPC layer — which already owns `operationId`s and the pending-operation map — so any future long-running module can support it, at the cost of touching shared protocol, rpc-host, and rpc-client.

## Considered Options

- **`bridge.cancel` envelope (chosen):** RPC-layer primitive. Reusable; correct home for cancellation. Requires core protocol change.
- **`fetch.abort` method call:** Contained in the fetch module, no protocol change, but forces the fetch module to track its own in-flight controllers separately from the RPC layer's operation ids, and isn't reusable by other modules.

## Consequences

- The RPC host must maintain an `AbortController` per in-flight operation and route `bridge.cancel` to it.
- The message is fire-and-forget: the WebView does not await an acknowledgement. The original `bridge.call` still resolves/rejects normally (typically rejecting with an abort error) when the operation settles.
