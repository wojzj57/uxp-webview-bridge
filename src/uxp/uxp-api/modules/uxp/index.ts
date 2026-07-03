import type { BridgeCapabilities } from "../../../../shared/types.js";
import {
  assertUxpMethodName,
  bytesToSecureStorageTransportValue,
  isUxpSecureStorageTransportValue,
  secureStorageTransportToHostValue,
  UXP_MODULE_ID,
  type UxpMenuItemInput,
  type UxpSerializedCommandInfo,
  type UxpSerializedMenuItem,
  type UxpSerializedMenuItemsReference,
  type UxpSerializedPanelInfo,
  type UxpSerializedPlugin,
  type UxpMethodName
} from "../../../../shared/contracts/uxp.js";
import type { UxpModuleAdapter } from "../../../module-registry.js";

declare const require: (moduleName: "uxp") => UxpHostModule;

interface UxpHostModule {
  readonly host: {
    readonly name: string;
    readonly version: string;
    readonly uiLocale: string;
  };
  readonly versions: {
    readonly uxp: string;
    readonly plugin: string;
  };
  readonly shell?: {
    openPath(path: string, developerText?: string): Promise<string>;
    openExternal(url: string, developerText?: string): Promise<string> | string | void;
  };
  readonly userInfo?: {
    userId(): string;
  };
  readonly pluginManager?: {
    readonly plugins: Set<UxpHostPlugin>;
  };
  readonly script?: {
    readonly args: readonly unknown[];
    readonly executionContext: unknown;
    setResult(result: unknown): void;
  };
  readonly entrypoints?: {
    setup(entrypoints: unknown): void;
    getPanel(id: string): UxpHostPanelInfo | null;
    getCommand(id: string): UxpHostCommandInfo | null;
  };
  readonly storage?: {
    readonly secureStorage?: {
      readonly length: number;
      setItem(key: string, value: string | ArrayBuffer): Promise<void>;
      getItem(key: string): Promise<Uint8Array | ArrayBuffer>;
      removeItem(key: string): Promise<void>;
      key(index: number): string;
      clear(): Promise<void>;
    };
  };
}

interface UxpHostPlugin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly manifest: unknown;
  readonly enabled: boolean;
  showPanel(panelId: string): Promise<void | string> | void | string;
  invokeCommand(commandId: string, ...params: readonly unknown[]): Promise<void> | void;
}

interface UxpShortcutInfo {
  readonly shortcutKey?: string;
  readonly commandKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
}

interface UxpHostMenuItems {
  readonly size: number;
  getItem(id: string): UxpHostMenuItem | null;
  getItemAt(index: number): UxpHostMenuItem | null;
  insertAt(index: number, newItem: UxpMenuItemInput): void;
  removeAt(index: number): void;
}

interface UxpHostMenuItem {
  readonly id: string;
  label: string;
  enabled: boolean;
  checked: boolean;
  readonly submenu?: UxpHostMenuItems;
  readonly parent?: UxpHostMenuItems;
  remove(): void;
}

interface UxpHostPanelInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly shortcut: UxpShortcutInfo;
  readonly title: string;
  readonly icons: readonly {
    readonly path: string;
    readonly scale: readonly number[];
    readonly theme: readonly string[];
    readonly species: readonly string[];
  }[];
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly maximumSize: { readonly width: number; readonly height: number };
  readonly preferredDockedSize: { readonly width: number; readonly height: number };
  readonly preferredFloatingSize: { readonly width: number; readonly height: number };
  readonly menuItems: UxpHostMenuItems;
}

interface UxpHostCommandInfo {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly shortcut: UxpShortcutInfo;
  readonly isManifestCommand?: boolean;
  readonly commandOptions?: unknown;
}

const entrypointMenuItems = new Map<string, UxpHostMenuItems>();
const entrypointMenuItem = new Map<string, UxpHostMenuItem>();
let nextEntrypointReferenceId = 1;

export const uxpModuleAdapter: UxpModuleAdapter = {
  moduleId: UXP_MODULE_ID,
  dispatch: (method, args, context) =>
    dispatchUxpCall(method, args, context.capabilities)
};

export async function dispatchUxpCall(
  method: string,
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): Promise<unknown> {
  assertUxpMethodName(method);

  switch (method) {
    case "host.name":
    case "host.version":
    case "host.uiLocale":
    case "versions.uxp":
    case "versions.plugin":
      expectUxpArgs(args, 0, 0, `uxp.${method}`);
      return readUxpProperty(method);

    case "shell.openPath": {
      assertUxpCapability(capabilities, "shell");
      const [path, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openPath"
      );
      assertUxpString(path, "uxp.shell.openPath path");
      assertOptionalUxpString(developerText, "uxp.shell.openPath developerText");
      const shell = requireUxpSubmodule("shell");
      return shell.openPath(path, developerText);
    }

    case "shell.openExternal": {
      assertUxpCapability(capabilities, "shell");
      const [url, developerText] = expectUxpArgs<[string, string | undefined]>(
        args,
        1,
        2,
        "uxp.shell.openExternal"
      );
      assertUxpString(url, "uxp.shell.openExternal url");
      assertOptionalUxpString(developerText, "uxp.shell.openExternal developerText");
      if (url.startsWith("file:")) {
        throw new Error("uxp.shell.openExternal does not allow file: URLs; use openPath instead.");
      }
      const result = await requireUxpSubmodule("shell").openExternal(url, developerText);
      return typeof result === "string" ? result : "";
    }

    case "userInfo.userId": {
      assertUxpCapability(capabilities, "userInfo");
      expectUxpArgs(args, 0, 0, "uxp.userInfo.userId");
      const userInfo = requireUxpSubmodule("userInfo");
      return userInfo.userId();
    }

    case "pluginManager.plugins": {
      assertUxpCapability(capabilities, "pluginManager");
      expectUxpArgs(args, 0, 0, "uxp.pluginManager.plugins");
      return Array.from(requireUxpSubmodule("pluginManager").plugins, serializePlugin);
    }

    case "plugin.showPanel": {
      assertUxpCapability(capabilities, "pluginManager");
      const [pluginId, panelId] = expectUxpArgs<[string, string]>(
        args,
        2,
        2,
        "uxp.Plugin.showPanel"
      );
      assertUxpString(pluginId, "uxp.Plugin.showPanel plugin id");
      assertUxpString(panelId, "uxp.Plugin.showPanel panelId");
      const result = await findPlugin(pluginId).showPanel(panelId);
      return typeof result === "string" ? result : undefined;
    }

    case "plugin.invokeCommand": {
      assertUxpCapability(capabilities, "pluginManager");
      const [pluginId, commandId, ...params] = expectUxpArgs<[string, string, ...unknown[]]>(
        args,
        2,
        Number.MAX_SAFE_INTEGER,
        "uxp.Plugin.invokeCommand"
      );
      assertUxpString(pluginId, "uxp.Plugin.invokeCommand plugin id");
      assertUxpString(commandId, "uxp.Plugin.invokeCommand commandId");
      await findPlugin(pluginId).invokeCommand(commandId, ...params);
      return undefined;
    }

    case "script.args": {
      assertUxpCapability(capabilities, "script");
      expectUxpArgs(args, 0, 0, "uxp.script.args");
      return requireUxpSubmodule("script").args;
    }

    case "script.executionContext": {
      assertUxpCapability(capabilities, "script");
      expectUxpArgs(args, 0, 0, "uxp.script.executionContext");
      return requireUxpSubmodule("script").executionContext;
    }

    case "script.setResult": {
      assertUxpCapability(capabilities, "script");
      const [result] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.script.setResult");
      requireUxpSubmodule("script").setResult(result);
      return undefined;
    }

    case "entrypoints.setup": {
      assertUxpCapability(capabilities, "entrypoints");
      throw new Error("uxp.entrypoints.setup cannot be called through the WebView bridge.");
    }

    case "entrypoints.getPanel": {
      assertUxpCapability(capabilities, "entrypoints");
      const [id] = expectUxpArgs<[string]>(args, 1, 1, "uxp.entrypoints.getPanel");
      assertUxpString(id, "uxp.entrypoints.getPanel id");
      const panel = requireUxpSubmodule("entrypoints").getPanel(id);
      return panel ? serializePanel(panel) : null;
    }

    case "entrypoints.getCommand": {
      assertUxpCapability(capabilities, "entrypoints");
      const [id] = expectUxpArgs<[string]>(args, 1, 1, "uxp.entrypoints.getCommand");
      assertUxpString(id, "uxp.entrypoints.getCommand id");
      const command = requireUxpSubmodule("entrypoints").getCommand(id);
      return command ? serializeCommand(command) : null;
    }

    case "entrypoints.menuItems.size": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItems.size");
      return getMenuItems(reference).size;
    }

    case "entrypoints.menuItems.getItem": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, id] = expectUxpArgs<[unknown, string]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItems.getItem"
      );
      assertUxpString(id, "uxp.entrypoints.menuItems.getItem id");
      const item = getMenuItems(reference).getItem(id);
      return item ? serializeMenuItem(item) : null;
    }

    case "entrypoints.menuItems.getItemAt": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, index] = expectUxpArgs<[unknown, number]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItems.getItemAt"
      );
      assertNonNegativeInteger(index, "uxp.entrypoints.menuItems.getItemAt index");
      const item = getMenuItems(reference).getItemAt(index);
      return item ? serializeMenuItem(item) : null;
    }

    case "entrypoints.menuItems.insertAt": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, index, newItem] = expectUxpArgs<[unknown, number, UxpMenuItemInput]>(
        args,
        3,
        3,
        "uxp.entrypoints.menuItems.insertAt"
      );
      assertNonNegativeInteger(index, "uxp.entrypoints.menuItems.insertAt index");
      assertMenuItemInput(newItem);
      getMenuItems(reference).insertAt(index, newItem);
      return undefined;
    }

    case "entrypoints.menuItems.removeAt": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, index] = expectUxpArgs<[unknown, number]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItems.removeAt"
      );
      assertNonNegativeInteger(index, "uxp.entrypoints.menuItems.removeAt index");
      getMenuItems(reference).removeAt(index);
      return undefined;
    }

    case "entrypoints.menuItem.getLabel": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getLabel");
      return getMenuItem(reference).label;
    }

    case "entrypoints.menuItem.getEnabled": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getEnabled");
      return getMenuItem(reference).enabled;
    }

    case "entrypoints.menuItem.getChecked": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getChecked");
      return getMenuItem(reference).checked;
    }

    case "entrypoints.menuItem.setLabel": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, label] = expectUxpArgs<[unknown, string]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItem.setLabel"
      );
      assertUxpString(label, "uxp.entrypoints.menuItem.setLabel label");
      getMenuItem(reference).label = label;
      return undefined;
    }

    case "entrypoints.menuItem.setEnabled": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, enabled] = expectUxpArgs<[unknown, boolean]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItem.setEnabled"
      );
      assertUxpBoolean(enabled, "uxp.entrypoints.menuItem.setEnabled enabled");
      getMenuItem(reference).enabled = enabled;
      return undefined;
    }

    case "entrypoints.menuItem.setChecked": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference, checked] = expectUxpArgs<[unknown, boolean]>(
        args,
        2,
        2,
        "uxp.entrypoints.menuItem.setChecked"
      );
      assertUxpBoolean(checked, "uxp.entrypoints.menuItem.setChecked checked");
      getMenuItem(reference).checked = checked;
      return undefined;
    }

    case "entrypoints.menuItem.remove": {
      assertUxpCapability(capabilities, "entrypoints");
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.remove");
      getMenuItem(reference).remove();
      return undefined;
    }

    case "storage.secureStorage.length": {
      assertUxpCapability(capabilities, "secureStorage");
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.length");
      return requireSecureStorage().length;
    }

    case "storage.secureStorage.setItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key, value] = expectUxpArgs<[string, unknown]>(
        args,
        2,
        2,
        "uxp.storage.secureStorage.setItem"
      );
      assertStorageKey(key, "uxp.storage.secureStorage.setItem key");
      if (!isUxpSecureStorageTransportValue(value)) {
        throw new Error("uxp.storage.secureStorage.setItem value must be string or binary transport data.");
      }
      await requireSecureStorage().setItem(key, secureStorageTransportToHostValue(value));
      return undefined;
    }

    case "storage.secureStorage.getItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.getItem");
      assertStorageKey(key, "uxp.storage.secureStorage.getItem key");
      const value = await requireSecureStorage().getItem(key);
      return bytesToSecureStorageTransportValue(
        value instanceof Uint8Array ? value : new Uint8Array(value)
      );
    }

    case "storage.secureStorage.removeItem": {
      assertUxpCapability(capabilities, "secureStorage");
      const [key] = expectUxpArgs<[string]>(args, 1, 1, "uxp.storage.secureStorage.removeItem");
      assertStorageKey(key, "uxp.storage.secureStorage.removeItem key");
      await requireSecureStorage().removeItem(key);
      return undefined;
    }

    case "storage.secureStorage.key": {
      assertUxpCapability(capabilities, "secureStorage");
      const [index] = expectUxpArgs<[number]>(args, 1, 1, "uxp.storage.secureStorage.key");
      if (!Number.isInteger(index) || index < 0) {
        throw new Error("uxp.storage.secureStorage.key index must be a non-negative integer.");
      }
      return requireSecureStorage().key(index);
    }

    case "storage.secureStorage.clear": {
      assertUxpCapability(capabilities, "secureStorage");
      expectUxpArgs(args, 0, 0, "uxp.storage.secureStorage.clear");
      await requireSecureStorage().clear();
      return undefined;
    }
  }
}

function readUxpProperty(method: UxpMethodName): string {
  const uxp = require("uxp");
  switch (method) {
    case "host.name":
      return uxp.host.name;
    case "host.version":
      return uxp.host.version;
    case "host.uiLocale":
      return uxp.host.uiLocale;
    case "versions.uxp":
      return uxp.versions.uxp;
    case "versions.plugin":
      return uxp.versions.plugin;
    default:
      throw new Error(`Unsupported uxp property: ${method}`);
  }
}

function requireSecureStorage(): NonNullable<
  NonNullable<UxpHostModule["storage"]>["secureStorage"]
> {
  const secureStorage = require("uxp").storage?.secureStorage;
  if (!secureStorage) {
    throw new Error("uxp.storage.secureStorage is not available in this UXP host.");
  }
  return secureStorage;
}

function requireUxpSubmodule<
  TName extends "shell" | "userInfo" | "pluginManager" | "script" | "entrypoints"
>(
  name: TName
): NonNullable<UxpHostModule[TName]> {
  const submodule = require("uxp")[name];
  if (!submodule) {
    throw new Error(`uxp.${name} is not available in this UXP host.`);
  }
  return submodule;
}

function serializePlugin(plugin: UxpHostPlugin): UxpSerializedPlugin {
  return {
    id: plugin.id,
    version: plugin.version,
    name: plugin.name,
    manifest: plugin.manifest,
    enabled: plugin.enabled
  };
}

function findPlugin(pluginId: string): UxpHostPlugin {
  for (const plugin of requireUxpSubmodule("pluginManager").plugins) {
    if (plugin.id === pluginId) {
      return plugin;
    }
  }

  throw new Error(`Unknown uxp plugin: ${pluginId}`);
}

function serializePanel(panel: UxpHostPanelInfo): UxpSerializedPanelInfo {
  return {
    id: panel.id,
    label: panel.label,
    description: panel.description,
    shortcut: serializeShortcut(panel.shortcut),
    title: panel.title,
    icons: panel.icons.map((icon) => ({
      path: icon.path,
      scale: Array.from(icon.scale),
      theme: Array.from(icon.theme),
      species: Array.from(icon.species)
    })),
    minimumSize: serializeSize(panel.minimumSize),
    maximumSize: serializeSize(panel.maximumSize),
    preferredDockedSize: serializeSize(panel.preferredDockedSize),
    preferredFloatingSize: serializeSize(panel.preferredFloatingSize),
    menuItems: rememberMenuItems(panel.menuItems)
  };
}

function serializeCommand(command: UxpHostCommandInfo): UxpSerializedCommandInfo {
  return {
    id: command.id,
    label: command.label,
    description: command.description,
    shortcut: serializeShortcut(command.shortcut),
    ...(command.isManifestCommand === undefined ? {} : { isManifestCommand: command.isManifestCommand }),
    ...(command.commandOptions === undefined ? {} : { commandOptions: command.commandOptions })
  };
}

function serializeMenuItem(item: UxpHostMenuItem): UxpSerializedMenuItem {
  return {
    kind: "uxp.entrypoints.menuItem",
    id: rememberMenuItem(item),
    itemId: item.id,
    label: item.label,
    enabled: item.enabled,
    checked: item.checked,
    ...(item.submenu ? { submenu: rememberMenuItems(item.submenu) } : {}),
    ...(item.parent ? { parent: rememberMenuItems(item.parent) } : {})
  };
}

function rememberMenuItems(menuItems: UxpHostMenuItems): UxpSerializedMenuItemsReference {
  const id = `entrypoints-menu-items-${nextEntrypointReferenceId++}`;
  entrypointMenuItems.set(id, menuItems);
  return { kind: "uxp.entrypoints.menuItems", id };
}

function rememberMenuItem(menuItem: UxpHostMenuItem): string {
  const id = `entrypoints-menu-item-${nextEntrypointReferenceId++}`;
  entrypointMenuItem.set(id, menuItem);
  return id;
}

function getMenuItems(reference: unknown): UxpHostMenuItems {
  if (!isMenuItemsReference(reference)) {
    throw new Error("uxp.entrypoints menuItems operation requires a remote menuItems reference.");
  }

  const menuItems = entrypointMenuItems.get(reference.id);
  if (!menuItems) {
    throw new Error(`Unknown uxp.entrypoints menuItems reference: ${reference.id}`);
  }
  return menuItems;
}

function getMenuItem(reference: unknown): UxpHostMenuItem {
  if (!isMenuItemReference(reference)) {
    throw new Error("uxp.entrypoints menuItem operation requires a remote menuItem reference.");
  }

  const menuItem = entrypointMenuItem.get(reference.id);
  if (!menuItem) {
    throw new Error(`Unknown uxp.entrypoints menuItem reference: ${reference.id}`);
  }
  return menuItem;
}

function isMenuItemsReference(value: unknown): value is UxpSerializedMenuItemsReference {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Partial<UxpSerializedMenuItemsReference>).kind === "uxp.entrypoints.menuItems" &&
    typeof (value as Partial<UxpSerializedMenuItemsReference>).id === "string"
  );
}

function isMenuItemReference(value: unknown): value is UxpSerializedMenuItem {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Partial<UxpSerializedMenuItem>).kind === "uxp.entrypoints.menuItem" &&
    typeof (value as Partial<UxpSerializedMenuItem>).id === "string"
  );
}

function serializeShortcut(shortcut: UxpShortcutInfo): UxpShortcutInfo {
  return {
    ...(shortcut.shortcutKey === undefined ? {} : { shortcutKey: shortcut.shortcutKey }),
    ...(shortcut.commandKey === undefined ? {} : { commandKey: shortcut.commandKey }),
    ...(shortcut.altKey === undefined ? {} : { altKey: shortcut.altKey }),
    ...(shortcut.shiftKey === undefined ? {} : { shiftKey: shortcut.shiftKey }),
    ...(shortcut.ctrlKey === undefined ? {} : { ctrlKey: shortcut.ctrlKey })
  };
}

function serializeSize(size: { readonly width: number; readonly height: number }): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: size.width,
    height: size.height
  };
}

function expectUxpArgs<T extends readonly unknown[]>(
  args: readonly unknown[],
  minLength: number,
  maxLength: number,
  method: string
): T {
  if (args.length < minLength || args.length > maxLength) {
    throw new Error(`${method} expects ${minLength === maxLength ? minLength : `${minLength}-${maxLength}`} arguments.`);
  }

  return args as unknown as T;
}

function assertUxpCapability(
  capabilities: BridgeCapabilities,
  capability: keyof BridgeCapabilities["uxp"]
): void {
  if (!capabilities.uxp[capability]) {
    throw new Error(`uxp ${capability} capability is disabled.`);
  }
}

function assertStorageKey(value: string, label: string): void {
  assertUxpString(value, label);
  if (value.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

function assertUxpString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
}

function assertUxpBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
}

function assertOptionalUxpString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`${label} must be a string when provided.`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
}

function assertMenuItemInput(value: unknown): asserts value is UxpMenuItemInput {
  if (typeof value === "string") {
    return;
  }

  if (!value || typeof value !== "object") {
    throw new Error("uxp.entrypoints menu item must be a string, separator, or object.");
  }

  const candidate = value as { readonly id?: unknown; readonly submenu?: unknown };
  if (typeof candidate.id !== "string") {
    throw new Error("uxp.entrypoints menu item object requires a string id.");
  }

  if (candidate.submenu !== undefined) {
    if (!Array.isArray(candidate.submenu)) {
      throw new Error("uxp.entrypoints menu item submenu must be an array.");
    }
    for (const child of candidate.submenu) {
      assertMenuItemInput(child);
    }
  }
}
