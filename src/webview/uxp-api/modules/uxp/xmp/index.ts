import {
  type RemoteUxpUnsupportedXmpConst,
  type RemoteUxpUnsupportedXmpConstructor,
  type RemoteUxpXmpFileConstructor,
  type RemoteUxpXmpMetaConstructor,
  type RemoteUxpXmpNamespace,
  type RemoteUxpXmpUtils
} from "../types/remote.js";

export function createUnsupportedXmpNamespace(): RemoteUxpXmpNamespace {
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

function createUnsupportedXmpConst(): RemoteUxpUnsupportedXmpConst {
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
  ) as RemoteUxpUnsupportedXmpConst;
}

function createUnsupportedXmpMetaConstructor(): RemoteUxpXmpMetaConstructor {
  const XMPMeta = createUnsupportedXmpConstructor("XMPMeta") as unknown as RemoteUxpXmpMetaConstructor & {
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

function createUnsupportedXmpFileConstructor(): RemoteUxpXmpFileConstructor {
  const XMPFile = createUnsupportedXmpConstructor("XMPFile") as unknown as RemoteUxpXmpFileConstructor & {
    getFormatInfo: (...args: readonly unknown[]) => never;
  };
  XMPFile.getFormatInfo = createUnsupportedXmpMethod("XMPFile.getFormatInfo");
  return Object.freeze(XMPFile);
}

function createUnsupportedXmpUtils(): RemoteUxpXmpUtils {
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

function createUnsupportedXmpConstructor(name: string): RemoteUxpUnsupportedXmpConstructor {
  const UnsupportedXmpClass = class {
    constructor(..._args: readonly unknown[]) {
      throw createXmpUnsupportedError(name);
    }
  };
  Object.defineProperty(UnsupportedXmpClass, "name", { value: name });
  return UnsupportedXmpClass as RemoteUxpUnsupportedXmpConstructor;
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
