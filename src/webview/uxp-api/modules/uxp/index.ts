import { getBridgeRpcClient } from "../../../runtime.js";
import {
  secureStorageTransportToUint8Array,
  secureStorageValueToTransport,
  UXP_MODULE_ID,
  type UxpCommandInfo,
  type UxpLocalFileSystemProvider,
  type UxpMenuItem,
  type UxpMenuItemInput,
  type UxpMenuItems,
  type UxpPanelInfo,
  type UxpPlugin,
  type UxpStorageErrors,
  type UxpStorageSymbol,
  type UxpSerializedCommandInfo,
  type UxpSerializedMenuItem,
  type UxpSerializedMenuItemsReference,
  type UxpSerializedPanelInfo,
  type UxpSerializedPlugin,
  type UxpNamespace,
  type UxpUnsupportedXmpConst,
  type UxpUnsupportedXmpConstructor,
  type UxpXmpFileConstructor,
  type UxpXmpMetaConstructor,
  type UxpXmpNamespace,
  type UxpXmpUtils
} from "../../../../shared/contracts/uxp.js";

interface UxpRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

export function createUxpNamespace(rpc: UxpRpc): UxpNamespace {
  const createMenuItems = (reference: UxpSerializedMenuItemsReference): UxpMenuItems => ({
    get size() {
      return rpc.call<number>(UXP_MODULE_ID, "entrypoints.menuItems.size", [reference]);
    },
    async getItem(id) {
      const item = await rpc.call<UxpSerializedMenuItem | null>(
        UXP_MODULE_ID,
        "entrypoints.menuItems.getItem",
        [reference, id]
      );
      return item ? createMenuItem(item) : null;
    },
    async getItemAt(index) {
      const item = await rpc.call<UxpSerializedMenuItem | null>(
        UXP_MODULE_ID,
        "entrypoints.menuItems.getItemAt",
        [reference, index]
      );
      return item ? createMenuItem(item) : null;
    },
    insertAt: (index, newItem: UxpMenuItemInput) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItems.insertAt", [reference, index, newItem]),
    removeAt: (index) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItems.removeAt", [reference, index])
  });

  const createMenuItem = (item: UxpSerializedMenuItem): UxpMenuItem => ({
    id: item.itemId,
    get label() {
      return rpc.call<string>(UXP_MODULE_ID, "entrypoints.menuItem.getLabel", [item]);
    },
    get enabled() {
      return rpc.call<boolean>(UXP_MODULE_ID, "entrypoints.menuItem.getEnabled", [item]);
    },
    get checked() {
      return rpc.call<boolean>(UXP_MODULE_ID, "entrypoints.menuItem.getChecked", [item]);
    },
    submenu: item.submenu ? createMenuItems(item.submenu) : undefined,
    parent: item.parent ? createMenuItems(item.parent) : undefined,
    setLabel: (label) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setLabel", [item, label]),
    setEnabled: (enabled) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setEnabled", [item, enabled]),
    setChecked: (checked) =>
      rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.setChecked", [item, checked]),
    remove: () => rpc.call<void>(UXP_MODULE_ID, "entrypoints.menuItem.remove", [item])
  });

  const createPanel = (panel: UxpSerializedPanelInfo): UxpPanelInfo => ({
    ...panel,
    menuItems: createMenuItems(panel.menuItems)
  });

  const createCommand = (command: UxpSerializedCommandInfo): UxpCommandInfo => ({ ...command });

  const createPlugin = (plugin: UxpSerializedPlugin): UxpPlugin => ({
    ...plugin,
    showPanel: (panelId) => rpc.call<void | string>(UXP_MODULE_ID, "plugin.showPanel", [plugin.id, panelId]),
    invokeCommand: (commandId, ...params) =>
      rpc.call<void>(UXP_MODULE_ID, "plugin.invokeCommand", [plugin.id, commandId, ...params])
  });

  return {
    host: {
      get name() {
        return rpc.call<string>(UXP_MODULE_ID, "host.name");
      },
      get version() {
        return rpc.call<string>(UXP_MODULE_ID, "host.version");
      },
      get uiLocale() {
        return rpc.call<string>(UXP_MODULE_ID, "host.uiLocale");
      }
    },
    versions: {
      get uxp() {
        return rpc.call<string>(UXP_MODULE_ID, "versions.uxp");
      },
      get plugin() {
        return rpc.call<string>(UXP_MODULE_ID, "versions.plugin");
      }
    },
    storage: {
      domains: createStorageSymbols([
        "appLocalCache",
        "appLocalData",
        "appLocalLibrary",
        "appLocalShared",
        "appLocalTemporary",
        "appRoamingData",
        "appRoamingLibrary",
        "userDesktop",
        "userDocuments",
        "userMusic",
        "userPictures",
        "userVideos"
      ]),
      formats: createStorageSymbols(["binary", "utf8"]),
      modes: createStorageSymbols(["readOnly", "readWrite"]),
      types: createStorageSymbols(["file", "folder"]),
      fileTypes: {
        all: Object.freeze([".*"]),
        images: Object.freeze(["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "tif", "tiff"]),
        text: Object.freeze(["txt", "text", "json", "js", "jsx", "ts", "tsx", "css", "html", "xml", "md"])
      },
      errors: createStorageErrors(),
      secureStorage: {
        get length() {
          return rpc.call<number>(UXP_MODULE_ID, "storage.secureStorage.length");
        },
        setItem(key, value) {
          return rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.setItem", [
            key,
            secureStorageValueToTransport(value)
          ]);
        },
        async getItem(key) {
          const value = await rpc.call<ReturnType<typeof secureStorageValueToTransport>>(
            UXP_MODULE_ID,
            "storage.secureStorage.getItem",
            [key]
          );
          return secureStorageTransportToUint8Array(value);
        },
        removeItem: (key) =>
          rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.removeItem", [key]),
        key: (index) => rpc.call<string>(UXP_MODULE_ID, "storage.secureStorage.key", [index]),
        clear: () => rpc.call<void>(UXP_MODULE_ID, "storage.secureStorage.clear")
      },
      localFileSystem: createUnsupportedLocalFileSystem()
    },
    shell: {
      openPath: (path, developerText) =>
        rpc.call<string>(UXP_MODULE_ID, "shell.openPath", [path, developerText]),
      openExternal: (url, developerText) =>
        rpc.call<string>(UXP_MODULE_ID, "shell.openExternal", [String(url), developerText])
    },
    userInfo: {
      userId: () => rpc.call<string>(UXP_MODULE_ID, "userInfo.userId")
    },
    pluginManager: {
      get plugins() {
        return rpc
          .call<readonly UxpSerializedPlugin[]>(UXP_MODULE_ID, "pluginManager.plugins")
          .then((plugins) => new Set(plugins.map(createPlugin)));
      }
    },
    script: {
      get args() {
        return rpc.call<readonly unknown[]>(UXP_MODULE_ID, "script.args");
      },
      get executionContext() {
        return rpc.call<unknown>(UXP_MODULE_ID, "script.executionContext");
      },
      setResult: (result) => rpc.call<void>(UXP_MODULE_ID, "script.setResult", [result])
    },
    entrypoints: {
      setup() {
        throw new Error("uxp.entrypoints.setup cannot be called from the WebView bridge.");
      },
      async getPanel(id) {
        const panel = await rpc.call<UxpSerializedPanelInfo | null>(
          UXP_MODULE_ID,
          "entrypoints.getPanel",
          [id]
        );
        return panel ? createPanel(panel) : null;
      },
      async getCommand(id) {
        const command = await rpc.call<UxpSerializedCommandInfo | null>(
          UXP_MODULE_ID,
          "entrypoints.getCommand",
          [id]
        );
        return command ? createCommand(command) : null;
      }
    },
    xmp: createUnsupportedXmpNamespace()
  };
}

function createStorageSymbols<const TName extends string>(
  names: readonly TName[]
): { readonly [TKey in TName]: UxpStorageSymbol } {
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, Symbol(`uxp.storage.${name}`)]))
  ) as { readonly [TKey in TName]: UxpStorageSymbol };
}

function createStorageErrors(): UxpStorageErrors {
  const errors = {
    AbstractMethodInvocationError: createNamedStorageError("AbstractMethodInvocationError"),
    DataFileFormatMismatchError: createNamedStorageError("DataFileFormatMismatchError"),
    DomainNotSupportedError: createNamedStorageError("DomainNotSupportedError"),
    EntryExistsError: createNamedStorageError("EntryExistsError"),
    EntryIsNotAFileError: createNamedStorageError("EntryIsNotAFileError"),
    EntryIsNotAFolderError: createNamedStorageError("EntryIsNotAFolderError"),
    EntryIsNotAnEntryError: createNamedStorageError("EntryIsNotAnEntryError"),
    FileIsReadOnlyError: createNamedStorageError("FileIsReadOnlyError"),
    InvalidFileFormatError: createNamedStorageError("InvalidFileFormatError"),
    InvalidFileNameError: createNamedStorageError("InvalidFileNameError"),
    NotAFileSystemError: createNamedStorageError("NotAFileSystemError"),
    OutOfSpaceError: createNamedStorageError("OutOfSpaceError"),
    PermissionDeniedError: createNamedStorageError("PermissionDeniedError"),
    ProviderMismatchError: createNamedStorageError("ProviderMismatchError")
  };
  return Object.freeze(errors);
}

function createNamedStorageError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function createUnsupportedLocalFileSystem(): UxpLocalFileSystemProvider {
  const reject = async (..._args: readonly unknown[]): Promise<never> => {
    throw createLocalFileSystemUnsupportedError();
  };
  const fail = (..._args: readonly unknown[]): never => {
    throw createLocalFileSystemUnsupportedError();
  };

  return Object.freeze({
    isFileSystemProvider: true,
    supportedDomains: Object.freeze([]),
    getFileForOpening: reject,
    getFileForSaving: reject,
    getFolder: reject,
    getTemporaryFolder: reject,
    getDataFolder: reject,
    getPluginFolder: reject,
    createEntryWithUrl: reject,
    getEntryWithUrl: reject,
    getFsUrl: fail,
    getNativePath: fail,
    createSessionToken: fail,
    getEntryForSessionToken: fail,
    createPersistentToken: reject,
    getEntryForPersistentToken: reject
  });
}

function createLocalFileSystemUnsupportedError(): Error {
  return new Error(
    "uxp.storage.localFileSystem is not supported by uxp-webview-bridge. Use the fs namespace for plugin:, plugin-data:, and plugin-temp: URLs."
  );
}

function createUnsupportedXmpNamespace(): UxpXmpNamespace {
  return Object.freeze({
    XMPConst: createUnsupportedXmpConst(),
    XMPDateTime: createUnsupportedXmpConstructor("XMPDateTime"),
    XMPFile: createUnsupportedXmpFileConstructor(),
    XMPFileInfo: createUnsupportedXmpConstructor("XMPFileInfo"),
    XMPIterator: createUnsupportedXmpConstructor("XMPIterator"),
    XMPMeta: createUnsupportedXmpMetaConstructor(),
    XMPPacketInfo: createUnsupportedXmpConstructor("XMPPacketInfo"),
    XMPProperty: createUnsupportedXmpConstructor("XMPProperty"),
    XMPUtils: createUnsupportedXmpUtils()
  });
}

function createUnsupportedXmpConst(): UxpUnsupportedXmpConst {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === Symbol.toStringTag) {
          return "UxpUnsupportedXMPConst";
        }
        throw createXmpUnsupportedError(`XMPConst.${String(property)}`);
      }
    }
  ) as UxpUnsupportedXmpConst;
}

function createUnsupportedXmpMetaConstructor(): UxpXmpMetaConstructor {
  const XMPMeta = createUnsupportedXmpConstructor("XMPMeta") as unknown as UxpXmpMetaConstructor & {
    deleteNamespace: (...args: readonly unknown[]) => never;
    dumpNamespaces: (...args: readonly unknown[]) => never;
    getNamespacePrefix: (...args: readonly unknown[]) => never;
    getNamespaceURI: (...args: readonly unknown[]) => never;
    registerNamespace: (...args: readonly unknown[]) => never;
  };
  XMPMeta.deleteNamespace = createUnsupportedXmpMethod("XMPMeta.deleteNamespace");
  XMPMeta.dumpNamespaces = createUnsupportedXmpMethod("XMPMeta.dumpNamespaces");
  XMPMeta.getNamespacePrefix = createUnsupportedXmpMethod("XMPMeta.getNamespacePrefix");
  XMPMeta.getNamespaceURI = createUnsupportedXmpMethod("XMPMeta.getNamespaceURI");
  XMPMeta.registerNamespace = createUnsupportedXmpMethod("XMPMeta.registerNamespace");
  return Object.freeze(XMPMeta);
}

function createUnsupportedXmpFileConstructor(): UxpXmpFileConstructor {
  const XMPFile = createUnsupportedXmpConstructor("XMPFile") as unknown as UxpXmpFileConstructor & {
    getFormatInfo: (...args: readonly unknown[]) => never;
  };
  XMPFile.getFormatInfo = createUnsupportedXmpMethod("XMPFile.getFormatInfo");
  return Object.freeze(XMPFile);
}

function createUnsupportedXmpUtils(): UxpXmpUtils {
  return Object.freeze({
    appendProperties: createUnsupportedXmpMethod("XMPUtils.appendProperties"),
    catenateArrayItems: createUnsupportedXmpMethod("XMPUtils.catenateArrayItems"),
    composeArrayItemPath: createUnsupportedXmpMethod("XMPUtils.composeArrayItemPath"),
    composeFieldSelector: createUnsupportedXmpMethod("XMPUtils.composeFieldSelector"),
    composeLangSelector: createUnsupportedXmpMethod("XMPUtils.composeLangSelector"),
    composeStructFieldPath: createUnsupportedXmpMethod("XMPUtils.composeStructFieldPath"),
    composeQualifierPath: createUnsupportedXmpMethod("XMPUtils.composeQualifierPath"),
    duplicateSubtree: createUnsupportedXmpMethod("XMPUtils.duplicateSubtree"),
    removeProperties: createUnsupportedXmpMethod("XMPUtils.removeProperties"),
    separateArrayItems: createUnsupportedXmpMethod("XMPUtils.separateArrayItems")
  });
}

function createUnsupportedXmpConstructor(name: string): UxpUnsupportedXmpConstructor {
  const UnsupportedXmpClass = class {
    constructor(..._args: readonly unknown[]) {
      throw createXmpUnsupportedError(name);
    }
  };
  Object.defineProperty(UnsupportedXmpClass, "name", { value: name });
  return UnsupportedXmpClass as UxpUnsupportedXmpConstructor;
}

function createUnsupportedXmpMethod(name: string): (...args: readonly unknown[]) => never {
  return (..._args: readonly unknown[]) => {
    throw createXmpUnsupportedError(name);
  };
}

function createXmpUnsupportedError(name: string): Error {
  return new Error(
    `uxp.xmp.${name} is not supported by uxp-webview-bridge. XMP requires native UXP XMP objects and file access that are not currently bridged.`
  );
}

export const uxp: UxpNamespace = createUxpNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});

export type { UxpNamespace } from "../../../../shared/contracts/uxp.js";
