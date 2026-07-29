# Type batched properties precisely

Status: accepted

Every public RemoteClass type exposes `batchGet` and `batchSet` in terms of its declared readable and writable property sets. A literal key tuple passed to `batchGet` produces a mapped result containing the resolved value type of each requested property, while `batchSet` accepts only declared writable properties and returns `Promise<void>`.

## Considered Options

- Preserve exact keys and values through per-type readable and writable property maps.
- Accept arbitrary strings and return `Record<string, unknown>`.

## Consequences

Consumers receive compile-time feedback for unknown keys, read-only writes, and incorrect values. Runtime descriptor validation remains mandatory because JavaScript callers and untrusted bridge messages do not carry TypeScript guarantees.

The two methods exist on every RemoteClass, including types with no writable properties. An empty `batchGet` resolves locally to an empty object and an empty `batchSet` resolves locally without sending an RPC; a non-empty write to a read-only type is rejected.

A non-empty `batchGet` either returns every requested, precisely typed property or rejects the entire operation. It does not return per-property success/error unions or partial result objects, and a remote getter failure identifies the failing property.

No permissive `string[]` overload returns `Record<string, unknown>`. Dynamically obtained strings must be validated and narrowed to the RemoteClass's readable-key union before typed callers can pass them; JavaScript and type-system escape hatches remain protected by runtime validation.

Requested keys are treated as a set represented in first-occurrence order. WebView removes duplicates before dispatch, so each property is read and decoded once.
