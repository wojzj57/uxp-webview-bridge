import type { BridgeCapabilityName } from "./capabilities.js";

export const BRIDGE_PROTOCOL_VERSION = "0.2.0" as const;

export type BridgeRequestType =
  | "bridge.get"
  | "bridge.set"
  | "bridge.call"
  | "bridge.flush"
  | "bridge.dispose"
  | "bridge.release-all";

export type BridgeCallbackInvocationMode = "awaited" | "listener";

export interface BridgeCallbackReference {
  readonly kind: "bridge.callback.ref";
  readonly callbackId: string;
}

export interface BridgeRequestEnvelope<TPayload = unknown> {
  readonly type: BridgeRequestType;
  readonly operationId: string;
  readonly payload: TPayload;
  /** Present on calls made while a Host-owned modal callback is active. */
  readonly sessionId?: string | undefined;
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

export interface BridgeSerializedError {
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

export interface BridgeErrorEnvelope {
  readonly type: "bridge.error";
  readonly operationId: string;
  readonly error: BridgeSerializedError;
}

export interface BridgeCallbackInvokeEnvelope {
  readonly type: "bridge.callback.invoke";
  readonly operationId: string;
  readonly callbackId: string;
  readonly args: readonly unknown[];
  readonly mode: BridgeCallbackInvocationMode;
  readonly parentOperationId?: string | undefined;
  readonly sessionId?: string | undefined;
}

export interface BridgeCallbackSuccessEnvelope<TPayload = unknown> {
  readonly type: "bridge.callback.success";
  readonly operationId: string;
  readonly callbackId: string;
  readonly sessionId?: string | undefined;
  readonly payload: TPayload;
}

export interface BridgeCallbackErrorEnvelope {
  readonly type: "bridge.callback.error";
  readonly operationId: string;
  readonly callbackId: string;
  readonly sessionId?: string | undefined;
  readonly error: BridgeSerializedError;
}

export type BridgeCallbackResultEnvelope<TPayload = unknown> =
  | BridgeCallbackSuccessEnvelope<TPayload>
  | BridgeCallbackErrorEnvelope;

export interface BridgeUnhandledErrorEnvelope {
  readonly type: "bridge.unhandled-error";
  readonly operationId: string;
  readonly error: BridgeSerializedError;
}

export type BridgeResponseEnvelope<TPayload = unknown> =
  | BridgeSuccessEnvelope<TPayload>
  | BridgeErrorEnvelope;

export function isBridgeCallbackReference(value: unknown): value is BridgeCallbackReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<BridgeCallbackReference>;
  return candidate.kind === "bridge.callback.ref" && typeof candidate.callbackId === "string";
}

/** Assert the plain-data subset supported for generic callback arguments and results. */
export function assertBridgeTransportValue(value: unknown, label = "bridge value"): void {
  assertTransportValue(value, label, new Set<object>());
}

function assertTransportValue(value: unknown, label: string, ancestors: Set<object>): void {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${label} must contain only finite numbers.`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${label} is not transport-safe.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${label} must not contain cycles.`);
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must contain only arrays and plain objects.`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertTransportValue(entry, `${label}[${index}]`, ancestors));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      assertTransportValue(entry, `${label}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
}
