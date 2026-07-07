# Immediate per-setter RPC, with instance `batchGet`/`batchSet` as escape hatches

`RemoteClass` instance property writes follow the XMP model: each `layer.opacity = 80` immediately appends one RPC to a per-instance queue (`#queue` promise chain) and fires it; every read or method call first `await`s the queue so reads observe prior writes (read-your-writes). Writes are therefore one RPC per property.

For callers who want to avoid N round-trips, `RemoteClass` exposes two **instance** methods aimed at advanced users: `layer.batchGet(propNames)` reads multiple properties of this RemoteObject in a single RPC, and `layer.batchSet(partialProps)` sets multiple properties of this RemoteObject in a single RPC. They operate on a single RemoteObject (`this`, not across objects) so the descriptor table can strongly type `propNames` and constrain `partialProps` to the writable subset.

## Considered Options

- **Immediate per-setter RPC + instance single-object `batchGet`/`batchSet` (chosen):** Instance setters stay dead-simple and identical to the proven XMP pattern; batching is an explicit, opt-in, strongly-typed escape hatch for advanced users, invoked directly on the object (`layer.batchSet({...})`). Two API tiers with clear ownership.
- **Deferred dirty-buffer + implicit merged flush:** setters accumulate into a pending map, flushed as one RPC on next read/call. Fewer round-trips automatically, and `batchSet` would just be an explicit flush. Rejected here: more base-class complexity (dirty buffer, flush invariants, last-write-wins), and the user preferred keeping instance setters simple with batching as a separate advanced tier.
- **Cross-object `batchSet`:** one RPC mutating many RemoteObjects. Rejected: partial-failure/transaction semantics entangle with `executeAsModal` scope boundaries; high risk, marginal benefit. Revisit via a dedicated ADR only if a real need appears.

## Consequences

- The UXP host must implement dedicated batch dispatch methods (e.g. a `batchGet`/`batchSet` per module) that accept `{ reference, propNames }` / `{ reference, props }`, distinct from single-property get/set dispatch. This adds one pair of `batch*` method-name constants per module protocol.
- `batchSet`'s `partialProps` is typed as a partial of the subclass's *writable* properties, derived from the descriptor table; passing a read-only property is a compile-time error.
- Because instance setters fire one RPC each, a sequence of instance writes costs N round-trips; advanced users are directed to `batchSet` when that matters. This trade-off is documented as intentional, not an oversight.
- `batchSet` still respects modal execution semantics on the UXP side (a batched write of mutating properties runs inside `executeAsModal`, like single writes).
