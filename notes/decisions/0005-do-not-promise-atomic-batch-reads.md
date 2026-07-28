# Do not promise atomic batched property reads

Status: accepted

`batchGet` flushes preceding writes for the same RemoteObject and reads all requested properties consecutively in one Host dispatch, but it does not promise a transactionally consistent snapshot of externally mutable Host state. Read-only batches do not enter Photoshop modal execution merely to simulate such a guarantee.

## Considered Options

- Promise one-dispatch ordering without snapshot isolation.
- Enter stronger locking or modal scopes and describe the result as an atomic snapshot.

## Consequences

The operation reduces bridge round trips and prevents bridge-level interleaving on the same RemoteObject. Callers that require a stronger domain-specific snapshot must use an API designed for that purpose rather than infer it from batching.
