# Do not promise transactional batched property writes

Status: accepted

A batched property write validates the complete request before mutation, then applies the properties in one Host operation and one Photoshop modal scope when mutation requires it. If a native property assignment fails, the operation stops and rejects without promising rollback of assignments that already completed.

## Considered Options

- Fail fast without rollback after complete pre-validation.
- Emulate a transaction by reading old values and issuing compensating writes after failure.

## Consequences

One RPC and one modal scope improve ordering and bridge overhead but do not imply atomicity. Callers must treat a rejected batch as potentially partially applied because compensating native writes cannot be made universally reliable.

The input object represents a set of desired properties rather than a caller-ordered command list. Host applies properties in the RemoteClass descriptor table's canonical order; callers with ordering dependencies must use separate awaited operations. A failure identifies the property whose assignment failed so callers can reason about which earlier canonical assignments may have taken effect.

The initial base API has no per-call cancellation option. Once Host mutation begins, cancellation cannot reliably undo completed assignments; ordinary bridge timeout and runtime destruction remain transport-lifecycle mechanisms rather than transactional rollback.
