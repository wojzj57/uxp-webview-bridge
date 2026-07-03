export const UXP_MODULE_ID = "uxp-api/modules/uxp";

export const UXP_METHOD_NAMES = [
  "host.name",
  "host.version",
  "host.uiLocale",
  "versions.uxp",
  "versions.plugin",
  "shell.openPath",
  "shell.openExternal",
  "userInfo.userId",
  "pluginManager.plugins",
  "plugin.showPanel",
  "plugin.invokeCommand",
  "script.args",
  "script.executionContext",
  "script.setResult",
  "entrypoints.setup",
  "entrypoints.getPanel",
  "entrypoints.getCommand",
  "entrypoints.menuItems.size",
  "entrypoints.menuItems.getItem",
  "entrypoints.menuItems.getItemAt",
  "entrypoints.menuItems.insertAt",
  "entrypoints.menuItems.removeAt",
  "entrypoints.menuItem.getLabel",
  "entrypoints.menuItem.getEnabled",
  "entrypoints.menuItem.getChecked",
  "entrypoints.menuItem.setLabel",
  "entrypoints.menuItem.setEnabled",
  "entrypoints.menuItem.setChecked",
  "entrypoints.menuItem.remove",
  "storage.secureStorage.length",
  "storage.secureStorage.setItem",
  "storage.secureStorage.getItem",
  "storage.secureStorage.removeItem",
  "storage.secureStorage.key",
  "storage.secureStorage.clear"
] as const;

export type UxpMethodName = (typeof UXP_METHOD_NAMES)[number];

export interface UxpSerializedPlugin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly manifest: unknown;
  readonly enabled: boolean;
}

export type UxpMenuSeparator = "-";

export interface UxpMenuItemDescriptor {
  readonly id: string;
  readonly label?: string;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly submenu?: readonly UxpMenuItemInput[];
}

export type UxpMenuItemInput = UxpMenuSeparator | string | UxpMenuItemDescriptor;

export interface UxpShortcutInfo {
  readonly shortcutKey?: string;
  readonly commandKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
}

export interface UxpIconInfo {
  readonly path: string;
  readonly scale: readonly number[];
  readonly theme: readonly string[];
  readonly species: readonly string[];
}

export interface UxpSizeInfo {
  readonly width: number;
  readonly height: number;
}

export interface UxpSerializedMenuItemsReference {
  readonly kind: "uxp.entrypoints.menuItems";
  readonly id: string;
}

export interface UxpSerializedMenuItem {
  readonly kind: "uxp.entrypoints.menuItem";
  readonly id: string;
  readonly itemId: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly checked: boolean;
  readonly submenu?: UxpSerializedMenuItemsReference;
  readonly parent?: UxpSerializedMenuItemsReference;
}

export interface UxpSerializedPanelInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly shortcut: UxpShortcutInfo;
  readonly title: string;
  readonly icons: readonly UxpIconInfo[];
  readonly minimumSize: UxpSizeInfo;
  readonly maximumSize: UxpSizeInfo;
  readonly preferredDockedSize: UxpSizeInfo;
  readonly preferredFloatingSize: UxpSizeInfo;
  readonly menuItems: UxpSerializedMenuItemsReference;
}

export interface UxpSerializedCommandInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly shortcut: UxpShortcutInfo;
  readonly isManifestCommand?: boolean;
  readonly commandOptions?: unknown;
}

export type UxpSecureStorageTransportValue =
  | {
      readonly kind: "text";
      readonly value: string;
    }
  | {
      readonly kind: "bytes";
      readonly encoding: "array";
      readonly value: readonly number[];
    }
  | {
      readonly kind: "bytes";
      readonly encoding: "base64";
      readonly value: string;
    };

export function isUxpSerializedPlugin(value: unknown): value is UxpSerializedPlugin {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UxpSerializedPlugin>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.enabled === "boolean"
  );
}

const UXP_METHOD_SET = new Set<string>(UXP_METHOD_NAMES);
const UXP_INLINE_BYTES_LIMIT = 32 * 1024;
const UXP_BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function isUxpMethodName(method: string): method is UxpMethodName {
  return UXP_METHOD_SET.has(method);
}

export function assertUxpMethodName(method: string): asserts method is UxpMethodName {
  if (!isUxpMethodName(method)) {
    throw new Error(`Unsupported uxp method: ${method}`);
  }
}

export function secureStorageValueToTransport(
  value: string | ArrayBuffer | ArrayBufferView
): UxpSecureStorageTransportValue {
  if (typeof value === "string") {
    return { kind: "text", value };
  }

  if (ArrayBuffer.isView(value)) {
    return bytesToSecureStorageTransportValue(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    );
  }

  return bytesToSecureStorageTransportValue(new Uint8Array(value));
}

export function secureStorageTransportToUint8Array(
  value: UxpSecureStorageTransportValue
): Uint8Array {
  if (value.kind === "text") {
    return stringToUtf8(value.value);
  }

  return value.encoding === "array" ? Uint8Array.from(value.value) : uxpBase64ToBytes(value.value);
}

export function secureStorageTransportToHostValue(
  value: UxpSecureStorageTransportValue
): string | ArrayBuffer {
  if (value.kind === "text") {
    return value.value;
  }

  const bytes = secureStorageTransportToUint8Array(value);
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

export function bytesToSecureStorageTransportValue(
  bytes: Uint8Array
): UxpSecureStorageTransportValue {
  if (bytes.byteLength <= UXP_INLINE_BYTES_LIMIT) {
    return {
      kind: "bytes",
      encoding: "array",
      value: Array.from(bytes)
    };
  }

  return {
    kind: "bytes",
    encoding: "base64",
    value: uxpBytesToBase64(bytes)
  };
}

export function isUxpSecureStorageTransportValue(
  value: unknown
): value is UxpSecureStorageTransportValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UxpSecureStorageTransportValue>;
  if (candidate.kind === "text") {
    return typeof candidate.value === "string";
  }

  if (candidate.kind !== "bytes") {
    return false;
  }

  if (candidate.encoding === "array") {
    return (
      Array.isArray(candidate.value) &&
      candidate.value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    );
  }

  return candidate.encoding === "base64" && typeof candidate.value === "string";
}

function uxpBytesToBase64(bytes: Uint8Array): string {
  let output = "";
  let index = 0;

  while (index < bytes.byteLength) {
    const first = bytes[index++] ?? 0;
    const second = index < bytes.byteLength ? bytes[index++] : undefined;
    const third = index < bytes.byteLength ? bytes[index++] : undefined;
    const triplet = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += UXP_BASE64_ALPHABET[(triplet >> 18) & 63];
    output += UXP_BASE64_ALPHABET[(triplet >> 12) & 63];
    output += second === undefined ? "=" : UXP_BASE64_ALPHABET[(triplet >> 6) & 63];
    output += third === undefined ? "=" : UXP_BASE64_ALPHABET[triplet & 63];
  }

  return output;
}

function uxpBase64ToBytes(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  if (normalized.length % 4 !== 0) {
    throw new Error("Invalid base64 uxp secureStorage transport data.");
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((normalized.length / 4) * 3 - padding);
  let outputIndex = 0;

  for (let index = 0; index < normalized.length; index += 4) {
    const first = decodeUxpBase64Char(normalized[index]);
    const second = decodeUxpBase64Char(normalized[index + 1]);
    const third = normalized[index + 2] === "=" ? 0 : decodeUxpBase64Char(normalized[index + 2]);
    const fourth = normalized[index + 3] === "=" ? 0 : decodeUxpBase64Char(normalized[index + 3]);
    const triplet = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 16) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = (triplet >> 8) & 255;
    }
    if (outputIndex < output.byteLength) {
      output[outputIndex++] = triplet & 255;
    }
  }

  return output;
}

function decodeUxpBase64Char(char: string | undefined): number {
  if (!char) {
    throw new Error("Invalid base64 uxp secureStorage transport data.");
  }

  const value = UXP_BASE64_ALPHABET.indexOf(char);
  if (value === -1) {
    throw new Error("Invalid base64 uxp secureStorage transport data.");
  }

  return value;
}

function stringToUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }

  const encoded = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    bytes[index] = encoded.charCodeAt(index);
  }
  return bytes;
}
