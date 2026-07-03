import type { UxpRpc } from "../rpc.js";
import type { RemoteUxpStorage } from "../types/remote.js";
import { createUnsupportedLocalFileSystem } from "./local-file-system.js";
import { createSecureStorageNamespace } from "./secure-storage.js";
import {
  createStorageDomains,
  createStorageErrors,
  createStorageFileTypes,
  createStorageFormats,
  createStorageModes,
  createStorageTypes
} from "./symbols.js";

export function createStorageNamespace(rpc: UxpRpc): RemoteUxpStorage {
  return {
    domains: createStorageDomains(),
    formats: createStorageFormats(),
    modes: createStorageModes(),
    types: createStorageTypes(),
    fileTypes: createStorageFileTypes(),
    errors: createStorageErrors(),
    secureStorage: createSecureStorageNamespace(rpc),
    localFileSystem: createUnsupportedLocalFileSystem()
  };
}
