# `sessionStorage` module

Import `sessionStorage` from `uxp-webview-bridge/webview`. Capability: `sessionStorage` (default enabled). It is independent from `localStorage` and asynchronous.

- `length: Promise<number>`
- `key(index): Promise<string | null>`
- `getItem(key): Promise<string | null>`
- `setItem(key, value): Promise<void>`
- `removeItem(key): Promise<void>`
- `clear(): Promise<void>`

Use it for session-scoped host storage, not as a synchronous browser global.
