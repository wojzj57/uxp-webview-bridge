import {
  normalizeBridgeCapabilities,
  type BridgeCapabilityConfig,
  type BridgeCapabilityName
} from "../shared/capabilities.js";
import { mergeAllowedOrigins } from "../shared/origins.js";
import { createUxpModuleRegistry } from "./module-registry.js";
import { RpcHost, type UxpWebViewElement } from "./rpc-host.js";
import { HostRouter, type MessageSourcePolicy } from "./host-router.js";
import { GenerationBoundHostBinding } from "./host-binding.js";
import { BridgeOwnedModalCoordinator } from "./bridge-owned-modal-coordinator.js";
import {
  BoundedBridgeSession
} from "./bounded-bridge-session.js";
import { QuarantineManager } from "./quarantine-manager.js";
import { PHOTOSHOP_CORE_MODULE_ID } from "../shared/photoshop-api/core-protocol.js";
import { constructAdapterOwners } from "./adapter-owner-transaction.js";
import { clipboardModuleAdapter } from "./uxp-api/global-members/clipboard/host.js";
import { cryptoModuleAdapter } from "./uxp-api/global-members/crypto/host.js";
import { localStorageModuleAdapter } from "./uxp-api/global-members/local-storage/host.js";
import { pathModuleAdapter } from "./uxp-api/global-members/path/host.js";
import { sessionStorageModuleAdapter } from "./uxp-api/global-members/session-storage/host.js";
import { fetchModuleAdapter } from "./uxp-api/modules/fetch/host.js";
import { createFsModuleAdapter } from "./uxp-api/modules/fs/host.js";
import { osModuleAdapter } from "./uxp-api/modules/os/host.js";
import {
  createCoreModuleAdapter
} from "./photoshop-api/modules/core/index.js";
import { createImagingModuleAdapter } from "./photoshop-api/modules/imaging/index.js";
import { createPhotoshopModuleAdapter } from "./photoshop-api/modules/photoshop/index.js";
import { createUxpModuleAdapter } from "./uxp-api/modules/uxp/index.js";

export interface ConfigUxpBridgeOptions {
  readonly webview: UxpWebViewElement;
  /** Additional trusted origins appended to the bridge defaults. */
  readonly allowedOrigins?: readonly string[];
  readonly capabilities?: BridgeCapabilityConfig;
  /** Host-to-WebView callback timeout. Set to `0` to disable. Defaults to 60 seconds. */
  readonly callbackTimeoutMs?: number;
  /** Maximum lifetime of bridge-owned temporary documents. Defaults to 30 minutes. */
  readonly temporaryDocumentTimeoutMs?: number;
  /** Require exact MessageEvent.source routing by default. */
  readonly messageSourcePolicy?: MessageSourcePolicy;
}

export interface UxpBridgeRuntime {
  readonly bindingId: string;
  readonly state: "waiting" | "handshaking" | "ready" | "degraded" | "closing" | "destroyed";
  readonly activeBridgeSessionId: string | undefined;
  readonly capabilities: readonly BridgeCapabilityName[];
  destroy(): Promise<void>;
}

const hostRouter = new HostRouter();
const bridgeOwnedModalCoordinator = new BridgeOwnedModalCoordinator();
const quarantineManager = new QuarantineManager();

export function configUxpBridge(options: ConfigUxpBridgeOptions): UxpBridgeRuntime {
  const capabilities = normalizeBridgeCapabilities(options.capabilities);
  let sessionBinding: GenerationBoundHostBinding | undefined;
  const supportsLoadBarrier = typeof options.webview.addEventListener === "function" &&
    typeof options.webview.removeEventListener === "function";
  const onLoadStart = (): void => sessionBinding?.beginDocumentGeneration();
  const onLoad = (): void => sessionBinding?.completeDocumentGeneration();
  const binding = hostRouter.bind({
    webview: options.webview,
    allowedOrigins: mergeAllowedOrigins(options.allowedOrigins),
    messageSourcePolicy: options.messageSourcePolicy ?? "required",
    receive: (message) => {
      sessionBinding?.receive(message);
    },
    cleanup: async () => {
      if (supportsLoadBarrier) {
        options.webview.removeEventListener?.("loadstart", onLoadStart);
        options.webview.removeEventListener?.("load", onLoad);
      }
      await sessionBinding?.destroy();
    }
  });
  sessionBinding = new GenerationBoundHostBinding({
    bindingId: binding.bindingId,
    webview: options.webview,
    capabilities,
    generationMode: supportsLoadBarrier ? "load-barrier" : "unsupported",
    initialGenerationPhase: "stable",
    createSession: async ({ bridgeSessionId, signal }) => {
      const adapters = await createAdapterOwnerSet(
        bridgeSessionId,
        options.temporaryDocumentTimeoutMs,
        signal
      );
      const registry = createUxpModuleRegistry(new Set(capabilities), adapters);
      const host = new RpcHost({
        webview: options.webview,
        allowedOrigins: mergeAllowedOrigins(options.allowedOrigins),
        bridgeSessionId,
        manageListener: false,
        ...(options.callbackTimeoutMs === undefined
          ? {}
          : { callbackTimeoutMs: options.callbackTimeoutMs }),
        dispatchCall: (payload, dispatchOptions) =>
          registry.dispatch(payload, {
            bridgeSessionId,
            modalCoordinator: bridgeOwnedModalCoordinator,
            signal: dispatchOptions.signal,
            operationId: dispatchOptions.operationId,
            callbacks: dispatchOptions.callbacks,
            ...(dispatchOptions.modalSessionId === undefined
              ? {}
              : { modalSessionId: dispatchOptions.modalSessionId })
          })
      });
      const session = new BoundedBridgeSession({
        bridgeSessionId,
        receive: (message: unknown) => host.receive(message),
        revoke: () => bridgeOwnedModalCoordinator.cancelWaiting(bridgeSessionId),
        drain: () => host.destroy(),
        owners: adapters.map((adapter) => ({
          name: adapter.moduleId,
          ...(adapter.moduleId === PHOTOSHOP_CORE_MODULE_ID ? {
            kind: "photoshop.temporary-documents",
            replacementKey: "photoshop.temporary-documents",
            replacementPolicy: "blocked-until-finalized" as const
          } : {}),
          cleanup: () => adapter.destroy?.()
        })),
        quarantineManager
      });
      return session;
    }
  });
  if (supportsLoadBarrier) {
    options.webview.addEventListener?.("loadstart", onLoadStart);
    options.webview.addEventListener?.("load", onLoad);
  }
  console.log("[uxp-webview-bridge] UXP bridge configured.");

  const runtime: UxpBridgeRuntime = {
    bindingId: binding.bindingId,
    get state() {
      const state = sessionBinding?.state ?? "destroyed";
      return state === "destroyed" ? "destroyed" : state;
    },
    get activeBridgeSessionId() {
      return sessionBinding?.activeBridgeSessionId;
    },
    capabilities,
    destroy: () => binding.destroy()
  };
  return runtime;
}

async function createAdapterOwnerSet(
  bridgeSessionId: string,
  temporaryDocumentTimeoutMs?: number,
  signal?: AbortSignal
) {
  quarantineManager.assertReplacementAllowed("photoshop.temporary-documents");
  let uxpAdapter: ReturnType<typeof createUxpModuleAdapter> | undefined;
  return constructAdapterOwners([
    {
      name: "uxp",
      create: () => (uxpAdapter = createUxpModuleAdapter(bridgeSessionId))
    },
    { name: "clipboard", create: () => ({ ...clipboardModuleAdapter }) },
    { name: "crypto", create: () => ({ ...cryptoModuleAdapter }) },
    { name: "fetch", create: () => ({ ...fetchModuleAdapter }) },
    { name: "fs", create: () => createFsModuleAdapter() },
    {
      name: "photoshop.core",
      create: () => createCoreModuleAdapter(
        temporaryDocumentTimeoutMs === undefined ? {} : { ttlMs: temporaryDocumentTimeoutMs }
      )
    },
    { name: "photoshop.imaging", create: () => createImagingModuleAdapter(bridgeSessionId) },
    { name: "localStorage", create: () => ({ ...localStorageModuleAdapter }) },
    { name: "os", create: () => ({ ...osModuleAdapter }) },
    { name: "path", create: () => ({ ...pathModuleAdapter }) },
    {
      name: "photoshop",
      create: () => createPhotoshopModuleAdapter(bridgeSessionId, {
        resolveStorageEntryReference: (reference, expectedType) => {
          if (!uxpAdapter) throw new Error("UXP adapter owner is not initialized.");
          return uxpAdapter.resolveStorageEntryReference(reference, expectedType);
        }
      })
    },
    { name: "sessionStorage", create: () => ({ ...sessionStorageModuleAdapter }) }
  ], {}, signal);
}

export type {
  BridgeCapabilityConfig,
  BridgeCapabilityGroup,
  BridgeCapabilityName,
  BridgeCapabilitySelector
} from "../shared/capabilities.js";
