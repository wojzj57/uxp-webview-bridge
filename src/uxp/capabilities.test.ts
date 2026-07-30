import type {
  BridgeCapabilityConfig as RootBridgeCapabilityConfig,
  BridgeCapabilityGroup as RootBridgeCapabilityGroup,
  BridgeCapabilityName as RootBridgeCapabilityName,
  BridgeCapabilitySelector as RootBridgeCapabilitySelector
} from "../index.js";
import type {
  BridgeCapabilityConfig,
  BridgeCapabilityGroup,
  BridgeCapabilityName,
  BridgeCapabilitySelector,
  ConfigUxpBridgeOptions
} from "./index.js";

const leaf: BridgeCapabilityName = "uxp.storage.localFileSystem";
const group: BridgeCapabilityGroup = "photoshop.all";
const selector: BridgeCapabilitySelector = group;
const config: BridgeCapabilityConfig = [leaf, selector];
const all: BridgeCapabilityConfig = "all";
const options: ConfigUxpBridgeOptions = {
  webview: { postMessage() {} },
  capabilities: config
};

const rootLeaf: RootBridgeCapabilityName = leaf;
const rootGroup: RootBridgeCapabilityGroup = group;
const rootSelector: RootBridgeCapabilitySelector = selector;
const rootConfig: RootBridgeCapabilityConfig = all;

// @ts-expect-error The legacy boolean capability object is no longer accepted.
const legacyConfig: BridgeCapabilityConfig = { fs: true };
// @ts-expect-error Only catalog leaves and groups are accepted.
const invalidLeaf: BridgeCapabilityConfig = ["uxp.*"];
// @ts-expect-error Top-level "all" is not an array selector.
const invalidAllSelector: BridgeCapabilityConfig = ["all"];

void options;
void rootLeaf;
void rootGroup;
void rootSelector;
void rootConfig;
void legacyConfig;
void invalidLeaf;
void invalidAllSelector;
