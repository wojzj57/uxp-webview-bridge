import {
  type UxpSerializedCommandInfo,
  type UxpSerializedPanelInfo
} from "../../../../../shared/contracts/uxp.js";
import { callUxp, type UxpRpc } from "../rpc.js";
import type {
  RemoteUxpCommandInfo,
  RemoteUxpEntrypoints,
  RemoteUxpPanelInfo
} from "../types/remote.js";
import { createMenuItems } from "./menu-items.js";

export function createEntrypointsNamespace(rpc: UxpRpc): RemoteUxpEntrypoints {
  return {
    setup() {
      throw new Error("uxp.entrypoints.setup cannot be called from the WebView bridge.");
    },
    async getPanel(id) {
      const panel = await callUxp<UxpSerializedPanelInfo | null>(
        rpc,
        "entrypoints.getPanel",
        [id]
      );
      return panel ? createPanel(rpc, panel) : null;
    },
    async getCommand(id) {
      const command = await callUxp<UxpSerializedCommandInfo | null>(
        rpc,
        "entrypoints.getCommand",
        [id]
      );
      return command ? createCommand(command) : null;
    }
  };
}

function createPanel(rpc: UxpRpc, panel: UxpSerializedPanelInfo): RemoteUxpPanelInfo {
  return {
    ...panel,
    menuItems: createMenuItems(rpc, panel.menuItems)
  };
}

function createCommand(command: UxpSerializedCommandInfo): RemoteUxpCommandInfo {
  return { ...command };
}
