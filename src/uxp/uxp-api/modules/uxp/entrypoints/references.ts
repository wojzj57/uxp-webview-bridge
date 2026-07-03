import {
  type UxpSerializedMenuItem,
  type UxpSerializedMenuItemsReference
} from "../../../../../shared/contracts/uxp.js";
import type { UxpHostMenuItem, UxpHostMenuItems } from "../host-module.js";

const entrypointMenuItems = new Map<string, UxpHostMenuItems>();
const entrypointMenuItem = new Map<string, UxpHostMenuItem>();
let nextEntrypointReferenceId = 1;

export function rememberMenuItems(menuItems: UxpHostMenuItems): UxpSerializedMenuItemsReference {
  const id = `entrypoints-menu-items-${nextEntrypointReferenceId++}`;
  entrypointMenuItems.set(id, menuItems);
  return { kind: "uxp.entrypoints.menuItems", id };
}

export function rememberMenuItem(menuItem: UxpHostMenuItem): string {
  const id = `entrypoints-menu-item-${nextEntrypointReferenceId++}`;
  entrypointMenuItem.set(id, menuItem);
  return id;
}

export function getMenuItems(reference: unknown): UxpHostMenuItems {
  if (!isMenuItemsReference(reference)) {
    throw new Error("uxp.entrypoints menuItems operation requires a remote menuItems reference.");
  }

  const menuItems = entrypointMenuItems.get(reference.id);
  if (!menuItems) {
    throw new Error(`Unknown uxp.entrypoints menuItems reference: ${reference.id}`);
  }
  return menuItems;
}

export function getMenuItem(reference: unknown): UxpHostMenuItem {
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
