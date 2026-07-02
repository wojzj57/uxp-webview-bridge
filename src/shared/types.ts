export type BridgeProtocolVersion = `${number}.${number}.${number}`;

export interface BridgeCapabilities {
  readonly os: boolean;
  readonly photoshop: boolean;
  readonly imaging: boolean;
  readonly batchPlay: boolean;
  readonly fs: {
    readonly read: boolean;
    readonly write: boolean;
    readonly schemes: readonly string[];
  };
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
