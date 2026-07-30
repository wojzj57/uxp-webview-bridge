export const BRIDGE_CAPABILITY_NAMES = Object.freeze([
  "clipboard",
  "crypto",
  "fetch",
  "fs",
  "localStorage",
  "os",
  "path",
  "sessionStorage",
  "photoshop.dom",
  "photoshop.core",
  "photoshop.imaging",
  "photoshop.batchPlay",
  "uxp.host",
  "uxp.versions",
  "uxp.shell",
  "uxp.userInfo",
  "uxp.pluginManager",
  "uxp.storage.secureStorage",
  "uxp.storage.localFileSystem",
  "uxp.xmp"
] as const);

export type BridgeCapabilityName = (typeof BRIDGE_CAPABILITY_NAMES)[number];

export const BRIDGE_CAPABILITY_GROUP_NAMES = Object.freeze([
  "photoshop.all",
  "uxp.all",
  "uxp.storage.all"
] as const);

export type BridgeCapabilityGroup = (typeof BRIDGE_CAPABILITY_GROUP_NAMES)[number];
export type BridgeCapabilitySelector = BridgeCapabilityName | BridgeCapabilityGroup;
export type BridgeCapabilityConfig = readonly BridgeCapabilitySelector[] | "all";

const BRIDGE_CAPABILITY_NAME_SET = new Set<string>(BRIDGE_CAPABILITY_NAMES);
const BRIDGE_CAPABILITY_GROUPS: Readonly<Record<BridgeCapabilityGroup, readonly BridgeCapabilityName[]>> = {
  "photoshop.all": BRIDGE_CAPABILITY_NAMES.filter((name) => name.startsWith("photoshop.")),
  "uxp.all": BRIDGE_CAPABILITY_NAMES.filter((name) => name.startsWith("uxp.")),
  "uxp.storage.all": BRIDGE_CAPABILITY_NAMES.filter((name) => name.startsWith("uxp.storage."))
};

export function normalizeBridgeCapabilities(config: unknown): readonly BridgeCapabilityName[] {
  if (config === "all") {
    return Object.freeze([...BRIDGE_CAPABILITY_NAMES]);
  }
  if (config === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(config)) {
    throw new TypeError("Bridge capabilities must be an allowlist or \"all\".");
  }

  const selected = new Set<BridgeCapabilityName>();
  const selectors = Array.from(config as readonly unknown[]);
  for (const selector of selectors) {
    if (typeof selector !== "string") {
      throw new TypeError("Bridge capability selectors must be strings.");
    }
    if (BRIDGE_CAPABILITY_NAME_SET.has(selector)) {
      selected.add(selector as BridgeCapabilityName);
      continue;
    }
    const group = BRIDGE_CAPABILITY_GROUPS[selector as BridgeCapabilityGroup];
    if (!group) {
      throw new TypeError(`Unknown Bridge capability selector: ${selector}`);
    }
    for (const name of group) {
      selected.add(name);
    }
  }

  return Object.freeze(BRIDGE_CAPABILITY_NAMES.filter((name) => selected.has(name)));
}
