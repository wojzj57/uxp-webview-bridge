# Remote Object Bridge Domain Model

This context defines how a WebView observes and changes state owned by an Adobe UXP host without treating host objects as local values.

## Language

**RemoteClass**
: The generic WebView-side behavior shared by stateful remote object types. It coordinates remote property reads, property writes, method calls, and batched property operations.
  _Avoid_: Proxy base, remote proxy class

**RemoteObject**
: A WebView-side representative of one live object owned by the UXP host. Its identity and mutable state remain remote even when it exposes object-like properties and methods locally.
  _Avoid_: Remote proxy, stub object

**Remote reference**
: A transport-safe identity for a RemoteObject that allows the UXP host to resolve the corresponding live object.
  _Avoid_: Handle, remote id

**Descriptor table**
: The authoritative declaration of the properties and methods exposed by one RemoteClass type, including which properties are writable and how returned values are interpreted.
  _Avoid_: Schema, property map

**Batched property read**
: One bridge operation that obtains several declared properties from the same RemoteObject.
  _Avoid_: Bulk fetch

**Batched property write**
: One bridge operation that submits several declared writable properties for the same RemoteObject.
  _Avoid_: Bulk update

**Queued property write**
: A property change accepted on the WebView side and ordered before subsequent reads or method calls on the same RemoteObject.
  _Avoid_: Async setter
