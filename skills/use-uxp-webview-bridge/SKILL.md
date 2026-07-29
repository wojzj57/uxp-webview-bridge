---
name: use-uxp-webview-bridge
description: Build, extend, debug, or review Adobe UXP plugins that use uxp-webview-bridge between a UXP host and a WebView. Use for bridge setup, permissions and capabilities, origin security, host-forwarded UXP/Photoshop/fs/os/fetch APIs, remote objects and collections, queued property writes, callbacks, modal Photoshop work, binary transport, resource cleanup, and compatibility decisions. Also use when migrating code away from direct host API access in a WebView.
---

# Use UXP WebView Bridge

Use this skill as the self-contained API and implementation guide for `uxp-webview-bridge`. Keep the runtime boundary explicit: import `uxp-webview-bridge/uxp` only in the UXP host bundle and `uxp-webview-bridge/webview` only in the WebView bundle. Execute every native UXP, Photoshop, OS, filesystem, and forwarded-network operation on the UXP side through the bridge.

## Core workflow

1. Identify the runtime of every edited file: UXP host or WebView.
2. Read [Host configuration](references/host-configuration.md) and [WebView configuration](references/webview-configuration.md) when establishing or changing bridge setup.
3. Read [Capabilities and manifest permissions](references/capabilities-and-manifest.md) before using a privileged namespace. Treat bridge capabilities and UXP manifest permissions as independent gates.
4. Load only the module and class references needed for the requested feature from the directory below.
5. Follow [Bridge semantics](references/bridge-semantics.md) for async properties, ordered writes, remote identity, snapshots, binary data, modal calls, and cleanup.
6. Follow [Errors, cancellation, and callbacks](references/errors-cancellation-and-callbacks.md) when handling failures, listeners, `AbortSignal`, or callback-based modal work.
7. Verify the consuming project using its own checks. When modifying this library, follow [Library development and verification](references/library-development-and-verification.md).

## Minimal setup

UXP host:

```ts
import { configUxpBridge } from "uxp-webview-bridge/uxp";

const webview = document.querySelector("webview") as
  | Parameters<typeof configUxpBridge>[0]["webview"]
  | null;
if (!webview) throw new Error("WebView not found");

const bridge = configUxpBridge({
  webview,
  allowedOrigins: ["https://app.example.com"],
  capabilities: {
    fs: false,
    os: true,
    clipboard: false,
    localStorage: false,
    sessionStorage: false,
    fetch: false,
    shell: false,
    userInfo: false,
    pluginManager: false,
    keyValueStorage: false,
    persistentFileStorage: false,
    xmp: false,
    photoshop: true,
    imaging: false,
    batchPlay: false
  }
});

window.addEventListener("unload", () => void bridge.destroy());
```

WebView:

```ts
import {
  configWebviewBridge,
  os,
  photoshop,
  uxp
} from "uxp-webview-bridge/webview";

const bridge = configWebviewBridge({
  timeoutMs: 15_000,
  allowedOrigins: ["https://app.example.com"]
});

const platform = await os.platform();
const document = await photoshop.app.activeDocument;
console.log(platform, await document.name, await uxp.host.name);

window.addEventListener("unload", () => void bridge.destroy());
```

Configure each side once. Await `destroy()` before configuring the same runtime again. Never restore removed factory APIs such as `createBridgeClient`, `createBridgeHost`, `createPhotoshopClient`, `createPhotoshopHost`, or `configureBridgeClient`.

Because capability options are partial and default to enabled, always provide all 15 keys for a remote or otherwise untrusted WebView. Treat the host example above as a least-privilege starting point, then enable only the modules the feature uses.
The currently non-configurable `crypto`, `path`, `uxp.host`, and `uxp.versions` surfaces remain available to every accepted WebView origin.

## Non-negotiable usage rules

- Await every remote property read: `const name = await layer.name`.
- Assign writable remote properties normally, but understand that assignment queues a host write: `layer.name = "Processed"`. A later remote read or method call flushes earlier writes.
- Prefer `await object.batchSet({...})` when completion must be explicit, and `await object.batchGet([...])` for one-round-trip reads.
- Re-read a collection property to refresh it. Collection wrappers are point-in-time snapshots.
- Do not routinely dispose persistent Photoshop DOM references. Explicitly dispose transient handles such as `PsImageData`, XMP objects, and UXP storage entries; close `fs` descriptors.
- Let the UXP host own Photoshop modal policy. Use `photoshop.core.executeAsModal` or `document.suspendHistory` only when the requested workflow needs an explicit callback session.
- Pass binary data as `ArrayBuffer` or typed arrays. Expect copied serialization rather than transfer-list semantics.
- Narrow `allowedOrigins`; added values extend built-in local origins rather than replacing them.
- Do not assume mirrored Adobe declarations imply bridge support. Use only the surfaces documented in this skill and exported by `uxp-webview-bridge/webview`.

## Reference directory

### Setup, security, and semantics

- [Package installation and bundling](references/package-installation-and-bundling.md)
- [Host configuration](references/host-configuration.md)
- [WebView configuration](references/webview-configuration.md)
- [Capabilities and manifest permissions](references/capabilities-and-manifest.md)
- [Bridge semantics](references/bridge-semantics.md)
- [Errors, cancellation, and callbacks](references/errors-cancellation-and-callbacks.md)
- [Library development and verification](references/library-development-and-verification.md)

### Runtime-neutral and UXP modules

- [clipboard module](references/module-clipboard.md)
- [crypto module](references/module-crypto.md)
- [forwarded fetch module](references/module-fetch.md)
- [fs module](references/module-fs.md)
- [os module](references/module-os.md)
- [path module](references/module-path.md)
- [localStorage module](references/module-local-storage.md)
- [sessionStorage module](references/module-session-storage.md)
- [uxp root module](references/module-uxp.md)
- [uxp.host module](references/module-uxp-host.md)
- [uxp.versions module](references/module-uxp-versions.md)
- [uxp.shell module](references/module-uxp-shell.md)
- [uxp.userInfo module](references/module-uxp-user-info.md)
- [uxp.pluginManager module](references/module-uxp-plugin-manager.md)
- [uxp.storage.secureStorage module](references/module-uxp-secure-storage.md)
- [uxp.storage.localFileSystem module](references/module-uxp-local-file-system.md)
- [uxp.xmp module](references/module-uxp-xmp.md)

### UXP storage and XMP classes

- [UxpStorageEntry](references/class-uxp-storage-entry.md)
- [UxpStorageFile](references/class-uxp-storage-file.md)
- [UxpStorageFolder](references/class-uxp-storage-folder.md)
- [UxpFileSystemProvider](references/class-uxp-file-system-provider.md)
- [UxpLocalFileSystemProvider](references/class-uxp-local-file-system-provider.md)
- [UxpPlugin](references/class-uxp-plugin.md)
- [XMPMeta](references/class-xmp-meta.md)
- [XMPFile](references/class-xmp-file.md)
- [XMPDateTime](references/class-xmp-date-time.md)
- [XMPIterator](references/class-xmp-iterator.md)
- [XMPUtils](references/class-xmp-utils.md)

### Photoshop modules

- [photoshop root module](references/module-photoshop.md)
- [photoshop.app module](references/module-photoshop-app.md)
- [photoshop.action module](references/module-photoshop-action.md)
- [photoshop.core module](references/module-photoshop-core.md)
- [photoshop.imaging module](references/module-photoshop-imaging.md)
- [Photoshop constants](references/module-photoshop-constants.md)

### Photoshop DOM classes and collections

- [PhotoshopApp](references/class-photoshop-app.md)
- [PsDocument](references/class-ps-document.md) and [Documents](references/class-documents.md)
- [DocumentSaveAs](references/class-document-save-as.md)
- [PsLayer](references/class-ps-layer.md) and [Layers](references/class-layers.md)
- [PsChannel](references/class-ps-channel.md) and [Channels](references/class-channels.md)
- [PsSelection](references/class-ps-selection.md)
- [PsHistoryState](references/class-ps-history-state.md) and [HistoryStates](references/class-history-states.md)
- [PsGuide](references/class-ps-guide.md) and [Guides](references/class-guides.md)
- [PsPathItem](references/class-ps-path-item.md) and [PathItems](references/class-path-items.md)
- [PsSubPathItem](references/class-ps-sub-path-item.md) and [SubPathItems](references/class-sub-path-items.md)
- [PsPathPoint](references/class-ps-path-point.md) and [PathPoints](references/class-path-points.md)
- [PsColorSampler](references/class-ps-color-sampler.md) and [ColorSamplers](references/class-color-samplers.md)
- [PsCountItem](references/class-ps-count-item.md) and [CountItems](references/class-count-items.md)
- [PsLayerComp](references/class-ps-layer-comp.md) and [LayerComps](references/class-layer-comps.md)
- [TextItem](references/class-text-item.md)
- [CharacterStyle](references/class-character-style.md)
- [ParagraphStyle](references/class-paragraph-style.md)
- [TextWarpStyle](references/class-text-warp-style.md)
- [TextFont](references/class-text-font.md) and [TextFonts](references/class-text-fonts.md)
- [Tool](references/class-tool.md)
- [ActionSet](references/class-action-set.md)
- [Action](references/class-action.md)

### Photoshop preferences

- [PreferencesBase](references/class-preferences-base.md)
- [Preferences](references/class-preferences.md)
- [PreferencesCursors](references/class-preferences-cursors.md)
- [PreferencesFileHandling](references/class-preferences-file-handling.md)
- [PreferencesGeneral](references/class-preferences-general.md)
- [PreferencesGuidesGridsAndSlices](references/class-preferences-guides-grids-and-slices.md)
- [PreferencesHistory](references/class-preferences-history.md)
- [PreferencesInterface](references/class-preferences-interface.md)
- [PreferencesNotifications](references/class-preferences-notifications.md)
- [PreferencesPerformance](references/class-preferences-performance.md)
- [PreferencesTools](references/class-preferences-tools.md)
- [PreferencesTransparencyAndGamut](references/class-preferences-transparency-and-gamut.md)
- [PreferencesType](references/class-preferences-type.md)
- [PreferencesUnitsAndRulers](references/class-preferences-units-and-rulers.md)

### Photoshop resource and value classes

- [Photoshop unit values](references/photoshop-unit-values.md)
- [PsImageData](references/class-ps-image-data.md)
- [SolidColor](references/class-solid-color.md)
- [CMYKColor](references/class-cmyk-color.md)
- [GrayColor](references/class-gray-color.md)
- [HSBColor](references/class-hsb-color.md)
- [LabColor](references/class-lab-color.md)
- [RGBColor](references/class-rgb-color.md)
- [PathPointInfo](references/class-path-point-info.md)
- [SubPathInfo](references/class-sub-path-info.md)
