# Keep batched property RPC type-specific

Status: accepted

`batchGet` and `batchSet` are universal WebView methods supplied by RemoteClass, but each RemoteClass descriptor maps them to type-specific Host RPC methods such as `layer.batchGet` or `document.batchSet`. The Host does not expose one permission-wide generic batch endpoint for every remote type.

## Considered Options

- Keep type-specific Host protocol methods behind a uniform WebView API.
- Introduce shared generic Host methods that dispatch solely from the remote reference type.

## Consequences

Each Host adapter retains ownership of native property access, serialization, validation, and Photoshop modal behavior. Capability policy can continue distinguishing remote types, at the cost of registering batch method names for every RemoteClass type.

A RemoteClass with non-empty readable or writable property sets must have the corresponding real batch RPC configured and covered by static checks. It must not silently fall back to multiple single-property calls; propertyless and fully read-only types may satisfy empty operations locally without a meaningless Host method.
