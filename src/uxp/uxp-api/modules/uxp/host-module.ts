import type { UxpMenuItemInput } from "../../../../shared/contracts/uxp.js";
import type { entrypoints as nativeEntrypoints } from "../../../../types/uxp/internal/entrypoints.js";
import type { host as nativeHost } from "../../../../types/uxp/internal/host.js";
import type { pluginManager as nativePluginManager } from "../../../../types/uxp/internal/plugin-manager.js";
import type { script as nativeScript } from "../../../../types/uxp/internal/script.js";
import type { shell as nativeShell } from "../../../../types/uxp/internal/shell.js";
import type { storage as nativeStorage } from "../../../../types/uxp/internal/storage.js";
import type { userInfo as nativeUserInfo } from "../../../../types/uxp/internal/user-info.js";
import type { versions as nativeVersions } from "../../../../types/uxp/internal/versions.js";

declare const require: (moduleName: "uxp") => UxpHostModule;

type SetElement<T> = T extends Set<infer Item> ? Item : never;
type NativeEntrypoints = typeof nativeEntrypoints;
type NativePanelInfo = ReturnType<NativeEntrypoints["getPanel"]>;
type NativeCommandInfo = ReturnType<NativeEntrypoints["getCommand"]>;
type NativeMenuItems = NativePanelInfo["menuItems"];
type NativeMenuItem = ReturnType<NativeMenuItems["getItem"]>;

interface UxpHostShell extends Omit<typeof nativeShell, "openExternal"> {
  openExternal(url: string, developerText?: string): Promise<string> | string | void;
}

interface UxpHostEntrypoints extends Omit<NativeEntrypoints, "getPanel" | "getCommand"> {
  getPanel(id: string): UxpHostPanelInfo | null;
  getCommand(id: string): UxpHostCommandInfo | null;
}

export interface UxpHostModule {
  readonly host: typeof nativeHost;
  readonly versions: typeof nativeVersions;
  readonly shell?: UxpHostShell;
  readonly userInfo?: typeof nativeUserInfo;
  readonly pluginManager?: typeof nativePluginManager;
  readonly script?: typeof nativeScript;
  readonly entrypoints?: UxpHostEntrypoints;
  readonly storage?: typeof nativeStorage;
}

export type UxpHostPlugin = SetElement<(typeof nativePluginManager)["plugins"]>;

export interface UxpShortcutInfo {
  readonly shortcutKey?: string;
  readonly commandKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
}

export interface UxpHostMenuItems extends Omit<NativeMenuItems, "getItem" | "getItemAt" | "insertAt"> {
  getItem(id: string): UxpHostMenuItem | null;
  getItemAt(index: number): UxpHostMenuItem | null;
  insertAt(index: number, newItem: UxpMenuItemInput): void;
}

export interface UxpHostMenuItem extends Omit<NativeMenuItem, "submenu" | "parent"> {
  readonly submenu?: UxpHostMenuItems;
  readonly parent?: UxpHostMenuItems;
}

export interface UxpHostPanelInfo extends Omit<NativePanelInfo, "shortcut" | "icons" | "menuItems"> {
  readonly shortcut: UxpShortcutInfo;
  readonly icons: readonly {
    readonly path: string;
    readonly scale: readonly number[];
    readonly theme: readonly string[];
    readonly species: readonly string[];
  }[];
  readonly menuItems: UxpHostMenuItems;
}

export interface UxpHostCommandInfo extends Omit<NativeCommandInfo, "shortcut"> {
  readonly shortcut: UxpShortcutInfo;
  readonly isManifestCommand?: boolean;
  readonly commandOptions?: unknown;
}

export function requireUxp(): UxpHostModule {
  return require("uxp");
}

export function requireUxpSubmodule<
  TName extends "shell" | "userInfo" | "pluginManager" | "script" | "entrypoints"
>(
  name: TName
): NonNullable<UxpHostModule[TName]> {
  const submodule = requireUxp()[name];
  if (!submodule) {
    throw new Error(`uxp.${name} is not available in this UXP host.`);
  }
  return submodule;
}

export function requireSecureStorage(): NonNullable<
  NonNullable<UxpHostModule["storage"]>["secureStorage"]
> {
  const secureStorage = requireUxp().storage?.secureStorage;
  if (!secureStorage) {
    throw new Error("uxp.storage.secureStorage is not available in this UXP host.");
  }
  return secureStorage;
}
