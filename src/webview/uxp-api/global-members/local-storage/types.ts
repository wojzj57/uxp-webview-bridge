export interface LocalStorageNamespace {
  readonly length: Promise<number>;
  key(index: number): Promise<string | null>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}
