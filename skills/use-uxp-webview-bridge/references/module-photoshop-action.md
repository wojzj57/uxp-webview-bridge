# `photoshop.action` module

Capability: `photoshop`; `batchPlay` and `batchPlaySync` also require `batchPlay`.

- `batchPlay(commands, options?)` and `batchPlaySync(commands, options?)` return descriptor arrays. The WebView call is asynchronous in both cases.
- `getIDFromString(value)` resolves a native Photoshop numeric id.
- `recordAction({ name, methodName }, info)` records a step whose playback handler already exists globally in the UXP host.
- `validateReference(refOrChain)` validates native action references.
- `addNotificationListener(events, listener)` and `removeNotificationListener(events, listener)` manage callbacks.

Descriptors are schema-less JSON with required `_obj`. `_ref` and `_id` values are Photoshop-native ids, not bridge remote-reference ids. The host forwards options and runs batchPlay modally. Retain the same listener function to remove it.
