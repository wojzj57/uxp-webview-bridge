import type { RemoteUxpLocalFileSystemProvider } from "../types/remote.js";

export function createUnsupportedLocalFileSystem(): RemoteUxpLocalFileSystemProvider {
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
