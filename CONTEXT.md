# Project Context

This repository implements `uxp-webview-bridge`, a library that connects Adobe UXP plugin hosts with WebView clients. It is not an application shell and should not contain product UI or business workflow code.

The package exposes remote WebView-side namespaces and UXP-side host adapters. WebView code talks through bridge proxies; real UXP, Photoshop, OS, and host-only work happens on the UXP side.

Long-lived contribution rules live in `AGENTS.md` and `CONTRIBUTING.md`. Testing rules live in `test/TESTING.md`.

## Language

**Forwarded fetch**:
A WebView `fetch` call whose actual network request is executed on the UXP host instead of the WebView, so it bypasses browser CORS restrictions. The WebView serializes the request, the UXP host performs it and returns the full response, and the WebView reconstructs a native `Response`.
_Avoid_: proxy fetch, CORS bypass

**Cancel envelope**:
A fire-and-forget bridge message (`bridge.cancel`) sent from the WebView to the UXP host to abort an in-flight operation, keyed by its `operationId`. A first-class RPC primitive available to any module, not only fetch.
_Avoid_: abort message, cancel call

**RemoteClass**:
The generic WebView-side base class that owns all cross-bridge communication for a stateful remote object: holding the remote reference, performing async property reads, queuing property writes, calling remote methods, and providing instance `batchGet`/`batchSet`. Subclasses (e.g. `PsLayer`) only *declare* which properties and methods exist; they contain no communication logic.
_Avoid_: proxy base, remote proxy class

**RemoteObject**:
A single live instance on the WebView side that stands in for one real object living on the UXP host (e.g. one Photoshop `Layer`). It is a `RemoteClass` subclass instance identified by a stable remote reference. Reads are async (`await layer.name`); writes are queued and flushed before the next read or method call.
_Avoid_: remote proxy, stub object

**Remote reference**:
The transport-safe envelope that identifies a RemoteObject across the bridge (`{ kind, type, id }`), plus its UXP-side handle registry entry holding the real native object. Distinct from the WebView RemoteObject instance that wraps it.
_Avoid_: handle (ambiguous), remote id (only the `id` field)

**Descriptor table**:
The static, declarative metadata a `RemoteClass` subclass provides listing its remote properties (with writability and any nested reference kind) and method names. The base class reads it at runtime to generate getters/setters and to drive `batchGet`/`batchSet`. It is the runtime companion to the `declare`d type members, kept in sync by a static test.
_Avoid_: schema, property map

**Value object**:
A pure-data result that crosses the bridge as plain JSON and is NOT a RemoteObject: no methods, no mutable remote state, no handle. E.g. `Bounds` (`{left,top,right,bottom,width,height}`), `histogram`. `await layer.bounds` yields a plain object.
_Avoid_: DTO, snapshot object

**Collection wrapper**:
A WebView-local object (e.g. `Layers`) that has NO remote handle of its own. It holds a snapshot array of member ids fetched in one RPC, and lazily resolves an id into a RemoteObject only when accessed by index. The snapshot is a point-in-time view and does not auto-refresh; accessing an id whose real object no longer exists raises `BridgeRemoteError`.
_Avoid_: remote collection, live collection

**Identity dedup**:
Guaranteeing that the same real UXP object always maps to the same remote reference id and the same WebView RemoteObject instance (so `===` holds). Achieved by keying the UXP handle registry on the object's real domain id (Photoshop `Layer.id` / `Document.id`) and caching WebView instances by reference id via `WeakRef` + `FinalizationRegistry`.
_Avoid_: interning, canonicalization
