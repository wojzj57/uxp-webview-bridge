import {
  type UxpSerializedCommandInfo,
  type UxpSerializedMenuItem,
  type UxpSerializedPanelInfo
} from "../../../../../shared/contracts/uxp.js";
import {
  type UxpHostCommandInfo,
  type UxpHostMenuItem,
  type UxpHostPanelInfo,
  type UxpShortcutInfo
} from "../host-module.js";
import { rememberMenuItem, rememberMenuItems } from "./references.js";

export function serializePanel(panel: UxpHostPanelInfo): UxpSerializedPanelInfo {
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

export function serializeCommand(command: UxpHostCommandInfo): UxpSerializedCommandInfo {
  return {
    id: command.id,
    label: command.label,
    description: command.description,
    shortcut: serializeShortcut(command.shortcut),
    ...(command.isManifestCommand === undefined ? {} : { isManifestCommand: command.isManifestCommand }),
    ...(command.commandOptions === undefined ? {} : { commandOptions: command.commandOptions })
  };
}

export function serializeMenuItem(item: UxpHostMenuItem): UxpSerializedMenuItem {
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
