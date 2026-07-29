# Snapshot batch inputs at invocation

Status: accepted

RemoteClass captures batched property inputs when the method is invoked, before waiting behind the per-object operation queue. `batchGet` copies, validates, and deduplicates its keys; `batchSet` copies and transport-encodes its values so later caller mutations cannot change the queued request.

## Considered Options

- Give each call invocation-time argument semantics.
- Retain references to caller-owned arrays and objects until the queued Host operation begins.

## Consequences

Queued execution affects timing and ordering but not request content. Implementations must also snapshot nested transport-safe values, binary envelopes, and RemoteObject references consistently rather than perform a delayed shallow read of caller-owned data.

`batchSet` accepts only a plain object or a null-prototype record and reads its own enumerable string keys. Arrays, built-in collection/value instances, and class instances are rejected as the top-level property map; inherited, symbol, and non-enumerable members are not protocol inputs. The captured map uses a null prototype so special keys cannot mutate its prototype.
