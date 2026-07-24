export type CryptoIntegerTypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array;

export interface CryptoNamespace {
  getRandomValues<TArray extends CryptoIntegerTypedArray>(array: TArray): Promise<TArray>;
  randomUUID(): Promise<string>;
}
