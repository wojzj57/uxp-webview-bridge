import type { BridgeCapabilities } from "./types.js";

export const DEFAULT_BRIDGE_CAPABILITIES: BridgeCapabilities = {
  os: true,
  uxp: {
    shell: false,
    userInfo: false,
    secureStorage: false
  },
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
    uxp: {
      ...DEFAULT_BRIDGE_CAPABILITIES.uxp,
      ...overrides?.uxp
    },
    fs: {
      ...DEFAULT_BRIDGE_CAPABILITIES.fs,
      ...overrides?.fs
    }
  };
}
