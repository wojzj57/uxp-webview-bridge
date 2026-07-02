export interface BridgeRemoteErrorDetails {
  readonly operationId: string;
  readonly remoteName?: string | undefined;
  readonly remoteMessage: string;
  readonly remoteStack?: string | undefined;
  readonly code?: string | undefined;
}

export class BridgeRemoteError extends Error {
  readonly operationId: string;
  readonly remoteName: string | undefined;
  readonly remoteMessage: string;
  readonly remoteStack: string | undefined;
  readonly code: string | undefined;

  constructor(details: BridgeRemoteErrorDetails) {
    super(details.remoteMessage);
    this.name = "BridgeRemoteError";
    this.operationId = details.operationId;
    this.remoteName = details.remoteName;
    this.remoteMessage = details.remoteMessage;
    this.remoteStack = details.remoteStack;
    this.code = details.code;
  }
}
