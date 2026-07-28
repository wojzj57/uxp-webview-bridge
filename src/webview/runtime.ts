import { RpcClient, type RpcClientOptions } from "./rpc-client.js";

let defaultRpcClient: RpcClient | undefined;

export interface BridgeClientRuntime {
  destroy(): Promise<void>;
}

export interface ConfigWebviewBridgeOptions extends RpcClientOptions {}

export function configWebviewBridge(options: ConfigWebviewBridgeOptions = {}): BridgeClientRuntime {
  if (defaultRpcClient) {
    throw new Error(
      "The WebView bridge is already configured. Await the current runtime's destroy() before configuring it again."
    );
  }
  defaultRpcClient = new RpcClient(options);
  console.log("[uxp-webview-bridge] WebView bridge configured.");
  const configuredRpcClient = defaultRpcClient;

  return {
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
