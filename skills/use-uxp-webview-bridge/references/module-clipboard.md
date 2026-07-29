# `clipboard` module

Import `clipboard` from `uxp-webview-bridge/webview`. Capability: `clipboard` (default enabled); matching UXP manifest permission is still required.

- `write(data: ClipboardTextData): Promise<void>` writes structured UXP clipboard text data.
- `writeText(text): Promise<void>` writes plain text.
- `read(): Promise<ClipboardTextData>` reads structured clipboard data.
- `readText(): Promise<string>` reads plain text.

```ts
import { clipboard } from "uxp-webview-bridge/webview";
await clipboard.writeText("Copied from the plugin");
const text = await clipboard.readText();
```
