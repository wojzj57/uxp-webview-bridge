import type { BridgeCapabilities } from "./types.js";

export const DEFAULT_BRIDGE_CAPABILITIES: BridgeCapabilities = {
  fs: false,
  os: true,
  shell: true,
  userInfo: true,
  pluginManager: true,
  keyValueStorage: true,
  persistentFileStorage: true,
  xmp: true,
  photoshop: true,
  imaging: true,
  batchPlay: true
};

export function mergeCapabilities(
  overrides: Partial<BridgeCapabilities> | undefined
): BridgeCapabilities {
  return {
    ...DEFAULT_BRIDGE_CAPABILITIES,
    ...overrides
  };
}
