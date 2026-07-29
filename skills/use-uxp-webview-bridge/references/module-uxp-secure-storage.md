# `uxp.storage.secureStorage` module

Capability: `keyValueStorage` (default enabled).

- `length: Promise<number>`
- `setItem(key, string | binary): Promise<void>`
- `getItem(key): Promise<Uint8Array>`
- `removeItem(key): Promise<void>`
- `key(index): Promise<string>`
- `clear(): Promise<void>`

Reads are binary even if the original value was a string; decode explicitly when needed.

```ts
const encoder = new TextEncoder();
const decoder = new TextDecoder();
await uxp.storage.secureStorage.setItem("token", encoder.encode(token));
const restored = decoder.decode(await uxp.storage.secureStorage.getItem("token"));
```
