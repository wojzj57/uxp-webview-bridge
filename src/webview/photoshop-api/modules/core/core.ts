import {
  PHOTOSHOP_CORE_MODULE_ID,
  type PhotoshopCoreMethodName
} from "@shared/photoshop-api/core-protocol.js";
import { getBridgeRpcClient } from "@webview/runtime.js";
import type {
  CalculateDialogSizeOptions,
  ColorConversionModel,
  ColorDescriptor,
  ConvertedColor,
  DisplayConfigurationOptions,
  DocumentCoreOptions,
  GetLayerGroupContentsOptions,
  HistorySuspendedOptions,
  MenuCommandMenuIDOptions,
  MenuCommandOptions,
  PhotoshopCore
} from "./types.js";

interface CoreRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
}

/** Build the WebView proxy for the query-only `photoshop.core` surface. */
export function createCoreNamespace(rpc: CoreRpc): PhotoshopCore {
  const call = <T>(method: PhotoshopCoreMethodName, args?: readonly unknown[]): Promise<T> =>
    rpc.call<T>(PHOTOSHOP_CORE_MODULE_ID, method, args);

  return {
    get apiVersion(): Promise<number> {
      return call<number>("core.apiVersion");
    },
    calculateDialogSize: (options: CalculateDialogSizeOptions) =>
      call("core.calculateDialogSize", [options]),
    convertColor: <Model extends ColorConversionModel>(sourceColor: ColorDescriptor, targetModel: Model) =>
      call<ConvertedColor<Model>>("core.convertColor", [sourceColor, targetModel]),
    getActiveTool: () => call("core.getActiveTool"),
    getCPUInfo: () => call("core.getCPUInfo"),
    getDisplayConfiguration: (options?: DisplayConfigurationOptions) =>
      call("core.getDisplayConfiguration", options === undefined ? undefined : [options]),
    getGPUInfo: () => call("core.getGPUInfo"),
    getLayerGroupContents: (options: GetLayerGroupContentsOptions) =>
      call("core.getLayerGroupContents", [options]),
    getLayerGroupContentsSync: (options: GetLayerGroupContentsOptions) =>
      call("core.getLayerGroupContentsSync", [options]),
    getLayerTree: (options: DocumentCoreOptions) => call("core.getLayerTree", [options]),
    getLayerTreeSync: (options: DocumentCoreOptions) => call("core.getLayerTreeSync", [options]),
    getMenuCommandState: (options: MenuCommandOptions) =>
      call("core.getMenuCommandState", [options]),
    getMenuCommandTitle: (options: MenuCommandOptions | MenuCommandMenuIDOptions) =>
      call("core.getMenuCommandTitle", [options]),
    getPluginInfo: () => call("core.getPluginInfo"),
    getUserIdleTime: () => call("core.getUserIdleTime"),
    historySuspended: (options: HistorySuspendedOptions) =>
      call("core.historySuspended", [options]),
    isModal: () => call("core.isModal"),
    translateUIString: (zstring: string) => call("core.translateUIString", [zstring])
  };
}

export const core: PhotoshopCore = createCoreNamespace({
  call: <T>(module: string, method: string, args?: readonly unknown[]) =>
    getBridgeRpcClient().call<T>(module, method, args)
});
