import type { BridgeCapabilities } from "./types.js";

export const DEFAULT_BRIDGE_CAPABILITIES: BridgeCapabilities = {
  os: true,
  photoshop: true,
  imaging: true,
  batchPlay: true,
  fs: {
    read: true,
    write: true,
    schemes: ["plugin:", "plugin-data:", "plugin-temp:"]
  }
};

export function mergeCapabilities(
  overrides: Partial<BridgeCapabilities> | undefined
): BridgeCapabilities {
  return {
    ...DEFAULT_BRIDGE_CAPABILITIES,
    ...overrides,
    fs: {
      ...DEFAULT_BRIDGE_CAPABILITIES.fs,
      ...overrides?.fs
    }
  };
}
