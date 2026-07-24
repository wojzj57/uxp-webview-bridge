import { RpcClient, type RpcClientOptions } from "./rpc-client.js";

let defaultRpcClient: RpcClient | undefined;

export interface BridgeClientRuntime {
  destroy(): void;
}

export interface ConfigWebviewBridgeOptions extends RpcClientOptions {}

export function configWebviewBridge(options: ConfigWebviewBridgeOptions = {}): BridgeClientRuntime {
  defaultRpcClient?.destroy();
  defaultRpcClient = new RpcClient(options);
  const configuredRpcClient = defaultRpcClient;

  return {
    destroy: () => {
      if (defaultRpcClient === configuredRpcClient) {
        defaultRpcClient.destroy();
        defaultRpcClient = undefined;
      }
    }
  };
}

export function getBridgeRpcClient(): RpcClient {
  defaultRpcClient ??= new RpcClient();
  return defaultRpcClient;
}
