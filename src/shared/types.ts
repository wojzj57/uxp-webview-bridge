import type { BridgeCapabilityName } from "./capabilities.js";

export type BridgeProtocolVersion = `${number}.${number}.${number}`;

export interface BridgeHandshakeHello {
  readonly type: "bridge.hello";
  readonly protocolVersion: BridgeProtocolVersion;
  readonly clientVersion: string;
  readonly clientInstanceId: string;
}

export interface BridgeHandshakeChallenge {
  readonly type: "bridge.handshake.challenge";
  readonly clientInstanceId: string;
  readonly candidateId: string;
  readonly documentGeneration: number;
  readonly challenge: string;
  readonly expiresAt: number;
}

export interface BridgeHandshakeAck {
  readonly type: "bridge.handshake.ack";
  readonly clientInstanceId: string;
  readonly candidateId: string;
  readonly documentGeneration: number;
  readonly challenge: string;
}

export interface BridgeHostInfo {
  readonly protocolVersion: BridgeProtocolVersion;
  readonly hostVersion: string;
  readonly capabilities: readonly BridgeCapabilityName[];
  readonly constantsHash?: string;
  readonly navigationReplacement: "supported" | "unsupported";
  readonly documentGenerationMode: "navigation-start" | "load-barrier" | "unsupported";
}

export interface BridgeHandshakeReady extends BridgeHostInfo {
  readonly type: "bridge.ready";
  readonly clientInstanceId: string;
  readonly candidateId: string;
  readonly documentGeneration: number;
  readonly bridgeSessionId: string;
  readonly readyNonce: string;
}

export interface BridgeReadyAck {
  readonly type: "bridge.ready.ack";
  readonly clientInstanceId: string;
  readonly candidateId: string;
  readonly documentGeneration: number;
  readonly bridgeSessionId: string;
  readonly readyNonce: string;
}

export interface BridgeEstablished {
  readonly type: "bridge.established";
  readonly clientInstanceId: string;
  readonly candidateId: string;
  readonly documentGeneration: number;
  readonly bridgeSessionId: string;
}

export interface BridgeSessionConfirm {
  readonly type: "bridge.session.confirm";
  readonly bridgeSessionId: string;
  readonly clientInstanceId: string;
  readonly documentGeneration: number;
}

export interface BridgeHandshakeCancel {
  readonly type: "bridge.handshake.cancel";
  readonly clientInstanceId: string;
  readonly candidateId?: string;
  readonly documentGeneration?: number;
  readonly challenge?: string;
  readonly bridgeSessionId?: string;
}

export interface BridgeHandshakeCancelAck {
  readonly type: "bridge.handshake.cancelled";
  readonly clientInstanceId: string;
  readonly candidateId?: string;
  readonly documentGeneration?: number;
  readonly bridgeSessionId?: string;
  readonly disposition:
    | "not-found"
    | "candidate-rolled-back"
    | "activating-session-closed"
    | "active-session-close-started";
  readonly cleanup: "completed" | "quarantined";
}

export interface BridgeHandshakeError {
  readonly type: "bridge.handshake.error";
  readonly clientInstanceId: string;
  readonly error: import("./protocol.js").BridgeSerializedError;
}

export interface BridgeRemoteReference {
  readonly kind: string;
  readonly type: string;
  readonly id: string;
  readonly bridgeSessionId: string;
}

export interface BridgeCallPayload {
  readonly module: string;
  readonly method: string;
  readonly args: readonly unknown[];
}
