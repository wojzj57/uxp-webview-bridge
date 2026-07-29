export type BridgeProtocolVersion = `${number}.${number}.${number}`;

export interface BridgeCapabilities {
  readonly fs: boolean;
  readonly os: boolean;
  readonly clipboard: boolean;
  readonly localStorage: boolean;
  readonly sessionStorage: boolean;
  readonly fetch: boolean;
  readonly shell: boolean;
  readonly userInfo: boolean;
  readonly pluginManager: boolean;
  readonly keyValueStorage: boolean;
  readonly persistentFileStorage: boolean;
  readonly xmp: boolean;
  readonly photoshop: boolean;
  readonly imaging: boolean;
  readonly batchPlay: boolean;
}

export interface BridgeHandshakeHello {
  readonly type: "bridge.hello";
  readonly protocolVersion: BridgeProtocolVersion;
  readonly clientVersion: string;
}

export interface BridgeHandshakeReady {
  readonly type: "bridge.ready";
  readonly protocolVersion: BridgeProtocolVersion;
  readonly hostVersion: string;
  readonly capabilities: BridgeCapabilities;
  readonly constantsHash?: string;
}

export interface BridgeRemoteReference {
  readonly kind: string;
  readonly id: string;
}

export interface BridgeCallPayload {
  readonly module: string;
  readonly method: string;
  readonly args: readonly unknown[];
}
