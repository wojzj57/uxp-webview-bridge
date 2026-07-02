import { RpcClient, type RpcClientOptions } from "./rpc-client.js";

let defaultRpcClient: RpcClient | undefined;

export interface BridgeClientRuntime {
  destroy(): void;
}

export interface ConfigWebviewBridgeOptions extends RpcClientOptions {}

export function configWebviewBridge(options: ConfigWebviewBridgeOptions = {}): BridgeClientRuntime {
  defaultRpcClient?.destroy();
  defaultRpcClient = new RpcClient(options);

  return {
    destroy: () => {
      defaultRpcClient?.destroy();
      defaultRpcClient = undefined;
    }
  };
}

export function getBridgeRpcClient(): RpcClient {
  defaultRpcClient ??= new RpcClient();
  return defaultRpcClient;
}
