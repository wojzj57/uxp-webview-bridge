import { RpcClient, type RpcClientOptions } from "./rpc-client.js";
import type { BridgeHostInfo } from "@shared/types.js";

let defaultRpcClient: RpcClient | undefined;

export interface BridgeClientRuntime {
  readonly ready: Promise<BridgeHostInfo>;
  readonly state: "connecting" | "ready" | "failed" | "closing" | "destroyed";
  readonly bridgeSessionId: string | undefined;
  destroy(): Promise<void>;
}

export interface ConfigWebviewBridgeOptions
  extends Omit<RpcClientOptions, "handshake" | "bridgeSessionId"> {}

export function configWebviewBridge(options: ConfigWebviewBridgeOptions = {}): BridgeClientRuntime {
  if (defaultRpcClient) {
    throw new Error(
      "The WebView bridge is already configured. Await the current runtime's destroy() before configuring it again."
    );
  }
  defaultRpcClient = new RpcClient({ ...options, handshake: true });
  console.log("[uxp-webview-bridge] WebView bridge configured.");
  const configuredRpcClient = defaultRpcClient;

  return {
    ready: configuredRpcClient.ready,
    get state() {
      return configuredRpcClient.state;
    },
    get bridgeSessionId() {
      return configuredRpcClient.activeBridgeSessionId;
    },
    destroy: async () => {
      if (defaultRpcClient === configuredRpcClient) {
        try {
          await defaultRpcClient.destroy();
        } finally {
          defaultRpcClient = undefined;
        }
      }
    }
  };
}

export function getBridgeRpcClient(): RpcClient {
  if (!defaultRpcClient) {
    throw new Error(
      "uxp-webview-bridge is not configured. Call configWebviewBridge() before using bridge APIs."
    );
  }
  return defaultRpcClient;
}
