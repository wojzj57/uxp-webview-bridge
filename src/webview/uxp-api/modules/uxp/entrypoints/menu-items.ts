import {
  type UxpSerializedMenuItem,
  type UxpSerializedMenuItemsReference
} from "../../../../../shared/contracts/uxp.js";
import { callUxp, type UxpRpc } from "../rpc.js";
import type {
  RemoteUxpMenuItem,
  RemoteUxpMenuItemInput,
  RemoteUxpMenuItems
} from "../types/remote.js";

export function createMenuItems(
  rpc: UxpRpc,
  reference: UxpSerializedMenuItemsReference
): RemoteUxpMenuItems {
  return {
    get size() {
      return callUxp<number>(rpc, "entrypoints.menuItems.size", [reference]);
    },
    async getItem(id) {
      const item = await callUxp<UxpSerializedMenuItem | null>(
        rpc,
        "entrypoints.menuItems.getItem",
        [reference, id]
      );
      return item ? createMenuItem(rpc, item) : null;
    },
    async getItemAt(index) {
      const item = await callUxp<UxpSerializedMenuItem | null>(
        rpc,
        "entrypoints.menuItems.getItemAt",
        [reference, index]
      );
      return item ? createMenuItem(rpc, item) : null;
    },
    insertAt: (index, newItem: RemoteUxpMenuItemInput) =>
      callUxp<void>(rpc, "entrypoints.menuItems.insertAt", [reference, index, newItem]),
    removeAt: (index) =>
      callUxp<void>(rpc, "entrypoints.menuItems.removeAt", [reference, index])
  };
}

function createMenuItem(rpc: UxpRpc, item: UxpSerializedMenuItem): RemoteUxpMenuItem {
  return {
    id: item.itemId,
    get label() {
      return callUxp<string>(rpc, "entrypoints.menuItem.getLabel", [item]);
    },
    get enabled() {
      return callUxp<boolean>(rpc, "entrypoints.menuItem.getEnabled", [item]);
    },
    get checked() {
      return callUxp<boolean>(rpc, "entrypoints.menuItem.getChecked", [item]);
    },
    submenu: item.submenu ? createMenuItems(rpc, item.submenu) : undefined,
    parent: item.parent ? createMenuItems(rpc, item.parent) : undefined,
    setLabel: (label) =>
      callUxp<void>(rpc, "entrypoints.menuItem.setLabel", [item, label]),
    setEnabled: (enabled) =>
      callUxp<void>(rpc, "entrypoints.menuItem.setEnabled", [item, enabled]),
    setChecked: (checked) =>
      callUxp<void>(rpc, "entrypoints.menuItem.setChecked", [item, checked]),
    remove: () => callUxp<void>(rpc, "entrypoints.menuItem.remove", [item])
  };
}
