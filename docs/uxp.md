[简体中文](./zh/uxp.md)

# UXP namespace guide

[Overview](./index.md) | [Getting started](./getting-started.md) | [Security and permissions](./security-and-permissions.md) | [UXP](./uxp.md) | [Photoshop](./photoshop.md) | [Forwarded fetch](./fetch.md)

Import `uxp` from the WebView entry point after configuring the bridge. Calls execute against the real UXP APIs in the plugin host; properties that are synchronous in native UXP are generally Promise-valued across the bridge.

## Namespace map and prerequisites

| Family | Representative surface | Effective bridge capability | Typical manifest concern |
| --- | --- | --- | --- |
| `uxp.host` | name, version, UI locale | none beyond UXP module dispatch | none identified by this repository |
| `uxp.versions` | UXP and plugin versions | none beyond UXP module dispatch | none identified by this repository |
| `uxp.pluginManager` | installed plugin snapshots and commands | `pluginManager` | host/plugin policy |
| `uxp.shell` | `openExternal`, `openPath` | `shell` | `requiredPermissions.launchProcess` |
| `uxp.storage.secureStorage` | secret byte values | `keyValueStorage` | use as the secret-storage boundary |
| `uxp.storage.localFileSystem` | files, folders, tokens, pickers | `persistentFileStorage` | `requiredPermissions.localFileSystem` as applicable |
| `uxp.userInfo` | user id | `userInfo` | `requiredPermissions.enableUserInfo` |
| `uxp.xmp` | XMP constructors, constants, metadata methods | `xmp` | availability varies with host APIs |

Consult the exported TypeScript types under [`src/webview/uxp-api/modules/uxp`](../src/webview/uxp-api/modules/uxp) for the exhaustive implemented interface.

## Promise-valued properties

Always await remote properties such as `uxp.host.name`, `uxp.host.version`, `uxp.versions.uxp`, `uxp.versions.plugin`, `uxp.pluginManager.plugins`, and `uxp.storage.secureStorage.length`.

```ts
import { uxp } from "uxp-webview-bridge/webview";

const [hostName, hostVersion, uxpVersion, pluginVersion, plugins] = await Promise.all([
  uxp.host.name,
  uxp.host.version,
  uxp.versions.uxp,
  uxp.versions.plugin,
  uxp.pluginManager.plugins
]);

console.log({ hostName, hostVersion, uxpVersion, pluginVersion, pluginCount: plugins.length });
```

## Shell URLs

`uxp.shell.openExternal` accepts an HTTPS URL when the target manifest's launch policy permits it. The WebView adapter rejects `file:` URLs locally for this method; use the intentionally separate `openPath` workflow for reviewed local paths.

```ts
import { uxp } from "uxp-webview-bridge/webview";

await uxp.shell.openExternal(
  new URL("https://example.com/help"),
  "Open product help"
);
```

Do not construct launch targets from untrusted text without application-level validation.

## Temporary file lifecycle

Storage entries are remote resource proxies. Clean up the test file and dispose both the file and folder proxies. Manifest permission requirements depend on the selected provider/operation and target host.

```ts
import { uxp } from "uxp-webview-bridge/webview";

const folder = await uxp.storage.localFileSystem.getTemporaryFolder();
let file;

try {
  file = await folder.createFile(`bridge-${Date.now()}.txt`, { overwrite: false });
  await file.write("hello", { format: uxp.storage.formats.utf8 });
  console.log(await file.read({ format: uxp.storage.formats.utf8 }));
} finally {
  if (file) {
    try {
      await file.delete();
    } catch {
      // Best-effort cleanup.
    }
    try {
      await file.dispose();
    } catch {
      // Best-effort cleanup.
    }
  }
  try {
    await folder.dispose();
  } catch {
    // Best-effort cleanup.
  }
}
```

Persistent file/folder proxies are resource handles even when the underlying filesystem entry is durable. Dispose the proxy when finished; deletion of the underlying file is a separate operation.

## Secure storage

Secure storage reads and writes bytes. Use a namespaced key, avoid logging the value, and remove temporary/test data.

```ts
import { uxp } from "uxp-webview-bridge/webview";

const key = "com.example.plugin/session-token";

try {
  await uxp.storage.secureStorage.setItem(key, new TextEncoder().encode("temporary-secret"));
  const secretBytes = await uxp.storage.secureStorage.getItem(key);
  console.log(`Loaded ${secretBytes.byteLength} secret bytes`);
} finally {
  await uxp.storage.secureStorage.removeItem(key);
}
```

Do not put credentials in URLs, logs, local storage, or session storage.

## XMP resource lifetime

XMP constructors return remote handles. Use the synchronous constant table locally, await remote methods, and dispose handles in `finally`.

```ts
import { uxp } from "uxp-webview-bridge/webview";

const { XMPConst, XMPMeta } = uxp.xmp;
const namespace = XMPConst.NS_XMP;
if (typeof namespace !== "string" || namespace.length === 0) {
  throw new Error("The XMP namespace is unavailable.");
}

const meta = new XMPMeta();

try {
  await meta.setProperty(namespace, "CreatorTool", "uxp-webview-bridge");
  const property = await meta.getProperty(namespace, "CreatorTool");
  console.log(property?.value);
} finally {
  await meta.dispose();
}
```

`XMPMeta`, `XMPFile`, `XMPIterator`, and `XMPDateTime` values demonstrated as disposable by the public types must be disposed. Persistent domain references and transient resource handles are not interchangeable: follow the cleanup contract of the exported type.

## Error handling

Remote UXP failures surface as `BridgeRemoteError` with remote metadata and an `operationId`. Capability failures indicate bridge dispatch policy; native permission failures indicate the manifest/host boundary. Handle them separately and do not broaden both controls simply to silence an error.
