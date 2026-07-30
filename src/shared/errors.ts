import type { BridgeCapabilityName } from "./capabilities.js";

export interface BridgeRemoteErrorDetails {
  readonly operationId: string;
  readonly remoteName?: string | undefined;
  readonly remoteMessage: string;
  readonly remoteStack?: string | undefined;
  readonly code?: string | undefined;
  readonly parentOperationId?: string | undefined;
  readonly callbackId?: string | undefined;
  readonly capability?: BridgeCapabilityName | undefined;
  readonly module?: string | undefined;
  readonly method?: string | undefined;
}

export class BridgeRemoteError extends Error {
  readonly operationId: string;
  readonly remoteName: string | undefined;
  readonly remoteMessage: string;
  readonly remoteStack: string | undefined;
  readonly code: string | undefined;
  readonly parentOperationId: string | undefined;
  readonly callbackId: string | undefined;
  readonly capability: BridgeCapabilityName | undefined;
  readonly module: string | undefined;
  readonly method: string | undefined;

  constructor(details: BridgeRemoteErrorDetails) {
    super(details.remoteMessage);
    this.name = "BridgeRemoteError";
    this.operationId = details.operationId;
    this.remoteName = details.remoteName;
    this.remoteMessage = details.remoteMessage;
    this.remoteStack = details.remoteStack;
    this.code = details.code;
    this.parentOperationId = details.parentOperationId;
    this.callbackId = details.callbackId;
    this.capability = details.capability;
    this.module = details.module;
    this.method = details.method;
  }
}
