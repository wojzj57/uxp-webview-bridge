export const BRIDGE_PROTOCOL_VERSION = "0.1.0" as const;

export type BridgeRequestType =
  | "bridge.get"
  | "bridge.set"
  | "bridge.call"
  | "bridge.flush"
  | "bridge.dispose";

export interface BridgeRequestEnvelope<TPayload = unknown> {
  readonly type: BridgeRequestType;
  readonly operationId: string;
  readonly payload: TPayload;
}

export interface BridgeCancelEnvelope {
  readonly type: "bridge.cancel";
  readonly operationId: string;
}

export interface BridgeSuccessEnvelope<TPayload = unknown> {
  readonly type: "bridge.success";
  readonly operationId: string;
  readonly payload: TPayload;
}

export interface BridgeErrorEnvelope {
  readonly type: "bridge.error";
  readonly operationId: string;
  readonly error: {
    readonly remoteName?: string | undefined;
    readonly remoteMessage: string;
    readonly remoteStack?: string | undefined;
    readonly code?: string | undefined;
  };
}

export type BridgeResponseEnvelope<TPayload = unknown> =
  | BridgeSuccessEnvelope<TPayload>
  | BridgeErrorEnvelope;
