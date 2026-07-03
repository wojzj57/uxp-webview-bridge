import type { UxpMenuItemInput } from "../../../../../shared/contracts/uxp.js";
import type { BridgeCapabilities } from "../../../../../shared/types.js";
import { requireUxpSubmodule } from "../host-module.js";
import {
  assertNonNegativeInteger,
  assertUxpBoolean,
  assertUxpCapability,
  assertUxpString,
  expectUxpArgs
} from "../validation.js";
import { getMenuItem, getMenuItems } from "./references.js";
import { serializeCommand, serializeMenuItem, serializePanel } from "./serialize.js";
import { assertMenuItemInput } from "./validate.js";

export function dispatchEntrypointsCall(
  method:
    | "entrypoints.setup"
    | "entrypoints.getPanel"
    | "entrypoints.getCommand"
    | "entrypoints.menuItems.size"
    | "entrypoints.menuItems.getItem"
    | "entrypoints.menuItems.getItemAt"
    | "entrypoints.menuItems.insertAt"
    | "entrypoints.menuItems.removeAt"
    | "entrypoints.menuItem.getLabel"
    | "entrypoints.menuItem.getEnabled"
    | "entrypoints.menuItem.getChecked"
    | "entrypoints.menuItem.setLabel"
    | "entrypoints.menuItem.setEnabled"
    | "entrypoints.menuItem.setChecked"
    | "entrypoints.menuItem.remove",
  args: readonly unknown[],
  capabilities: BridgeCapabilities
): unknown {
  assertUxpCapability(capabilities, "entrypoints");

  switch (method) {
    case "entrypoints.setup":
      throw new Error("uxp.entrypoints.setup cannot be called through the WebView bridge.");

    case "entrypoints.getPanel": {
      const [id] = expectUxpArgs<[string]>(args, 1, 1, "uxp.entrypoints.getPanel");
      assertUxpString(id, "uxp.entrypoints.getPanel id");
      const panel = requireUxpSubmodule("entrypoints").getPanel(id);
      return panel ? serializePanel(panel) : null;
    }

    case "entrypoints.getCommand": {
      const [id] = expectUxpArgs<[string]>(args, 1, 1, "uxp.entrypoints.getCommand");
      assertUxpString(id, "uxp.entrypoints.getCommand id");
      const command = requireUxpSubmodule("entrypoints").getCommand(id);
      return command ? serializeCommand(command) : null;
    }

    case "entrypoints.menuItems.size": {
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItems.size");
      return getMenuItems(reference).size;
    }

    case "entrypoints.menuItems.getItem": {
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
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getLabel");
      return getMenuItem(reference).label;
    }

    case "entrypoints.menuItem.getEnabled": {
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getEnabled");
      return getMenuItem(reference).enabled;
    }

    case "entrypoints.menuItem.getChecked": {
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.getChecked");
      return getMenuItem(reference).checked;
    }

    case "entrypoints.menuItem.setLabel": {
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
      const [reference] = expectUxpArgs<[unknown]>(args, 1, 1, "uxp.entrypoints.menuItem.remove");
      getMenuItem(reference).remove();
      return undefined;
    }
  }
}
