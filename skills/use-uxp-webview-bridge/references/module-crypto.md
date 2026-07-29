# `crypto` module

Import `crypto` from `uxp-webview-bridge/webview`. It is always registered and runs in UXP.

- `getRandomValues(array)` accepts integer typed arrays and asynchronously returns the filled array.
- `randomUUID()` returns a UUID string.

Unlike browser `crypto.getRandomValues`, the call is asynchronous:

```ts
const bytes = await crypto.getRandomValues(new Uint8Array(16));
const id = await crypto.randomUUID();
```
