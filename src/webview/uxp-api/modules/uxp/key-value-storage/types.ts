import type { storage as nativeStorage } from "@shared/types/uxp/internal/storage.js";

export type UxpSecureStorageSetItemValue = Parameters<typeof nativeStorage.secureStorage.setItem>[1] | ArrayBufferView;

export interface UxpSecureStorage {
  readonly length: Promise<number>;
  setItem(key: string, value: UxpSecureStorageSetItemValue): Promise<void>;
  getItem(key: string): Promise<Uint8Array>;
  removeItem(key: string): Promise<void>;
  key(index: number): Promise<string>;
  clear(): Promise<void>;
}

export interface UxpStorage {
  readonly secureStorage: UxpSecureStorage;
}
