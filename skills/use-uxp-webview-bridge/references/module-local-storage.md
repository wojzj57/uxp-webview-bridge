# `localStorage` module

Import `localStorage` from `uxp-webview-bridge/webview`. Capability: `localStorage` (default enabled). This is UXP-side storage with an asynchronous Web Storage-like API.

- `length: Promise<number>`
- `key(index): Promise<string | null>`
- `getItem(key): Promise<string | null>`
- `setItem(key, value): Promise<void>`
- `removeItem(key): Promise<void>`
- `clear(): Promise<void>`

Do not use synchronous browser-storage assumptions: `await localStorage.length` and await every method.
