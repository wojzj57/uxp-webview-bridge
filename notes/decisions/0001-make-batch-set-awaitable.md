# Make batched property writes awaitable

Status: accepted

`RemoteClass.batchSet` returns `Promise<void>` and resolves only after the UXP host has completed the batched property write. This gives callers an explicit completion and error boundary while preserving the per-RemoteObject ordering that makes later reads and method calls observe preceding writes.

## Considered Options

- Return `Promise<void>` from the explicit batch operation.
- Return `void` and expose failures only through a later dependent operation, matching JavaScript property-setter syntax.

## Consequences

Callers may either `await` the batch directly or intentionally leave it queued. Existing calls that ignore the return value remain valid, while public RemoteClass interfaces and tests must change from `void` to `Promise<void>`.

Both batched operations reject through their returned Promise for local validation failures. WebView validates against the RemoteClass descriptor table for early feedback, while the UXP Host repeats validation as the authoritative trust boundary.

An awaited or caught `batchSet` failure is not replayed by the next remote operation. Later operations still wait for the batch to settle and then the per-object queue recovers. This differs deliberately from JavaScript property setters, whose queued remote failures must be surfaced by a later dependent operation because setters cannot return a Promise.

Local descriptor validation rejects with `TypeError` and does not fabricate remote metadata. Failures returned by the UXP Host surface as `BridgeRemoteError` with the normal remote metadata and `operationId`; no batch-specific error class is introduced.
