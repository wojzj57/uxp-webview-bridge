import { createOperationId } from "@shared/operation-id.js";
import { isAllowedOrigin } from "@shared/origins.js";
import type { UxpWebViewElement } from "./rpc-host.js";

export type MessageSourcePolicy = "required" | "legacy-single-webview";

export interface HostMessageListenerTarget {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
}

export interface HostRouterOptions {
  readonly listenerTarget?: HostMessageListenerTarget;
  readonly onDiagnostic?: (event: HostRouterDiagnostic) => void;
}

export interface HostRouterDiagnostic {
  readonly type: "message-rejected";
  readonly reason: "unknown-source" | "source-required" | "origin";
}

export interface HostRouterBindingOptions {
  readonly webview: UxpWebViewElement;
  readonly allowedOrigins: readonly string[];
  readonly messageSourcePolicy: MessageSourcePolicy;
  readonly receive: (message: unknown) => void;
  readonly cleanup?: () => void | Promise<void>;
}

export interface HostRouterBinding {
  readonly bindingId: string;
  readonly webview: UxpWebViewElement;
  destroy(): Promise<void>;
}

interface BindingRecord extends HostRouterBindingOptions {
  readonly bindingId: string;
  destroyed: boolean;
  destroyPromise?: Promise<void>;
}

export class HostRouter {
  private readonly listenerTarget: HostMessageListenerTarget;
  private readonly onDiagnostic: ((event: HostRouterDiagnostic) => void) | undefined;
  private readonly bindingByElement = new WeakMap<object, BindingRecord>();
  private readonly bindings = new Set<BindingRecord>();
  private listenerInstalled = false;
  private readonly onMessageBound = (event: MessageEvent<unknown>): void => {
    this.route(event);
  };

  constructor(options: HostRouterOptions = {}) {
    this.listenerTarget = options.listenerTarget ?? window;
    this.onDiagnostic = options.onDiagnostic;
  }

  bind(options: HostRouterBindingOptions): HostRouterBinding {
    const element = options.webview as object;
    if (this.bindingByElement.has(element)) {
      throw codedError(
        "ERR_BRIDGE_DUPLICATE_WEBVIEW_BINDING",
        "The HTMLWebViewElement already has an active bridge binding."
      );
    }
    if (
      (options.messageSourcePolicy === "legacy-single-webview" && this.bindings.size > 0) ||
      [...this.bindings].some(
        (binding) => binding.messageSourcePolicy === "legacy-single-webview"
      )
    ) {
      throw codedError(
        "ERR_BRIDGE_MESSAGE_SOURCE_REQUIRED",
        "Legacy origin-only routing cannot coexist with another bridge binding."
      );
    }

    const record: BindingRecord = {
      ...options,
      bindingId: createOperationId(),
      destroyed: false
    };
    this.bindingByElement.set(element, record);
    this.bindings.add(record);
    this.installListener();

    return {
      bindingId: record.bindingId,
      webview: record.webview,
      destroy: () => this.destroyBinding(record)
    };
  }

  private route(event: MessageEvent<unknown>): void {
    const source = event.source;
    if (source && typeof source === "object") {
      const binding = this.bindingByElement.get(source);
      if (!binding || binding.destroyed) {
        this.diagnose("unknown-source");
        return;
      }
      if (!isAllowedOrigin(event.origin, binding.allowedOrigins)) {
        this.diagnose("origin");
        return;
      }
      binding.receive(event.data);
      return;
    }

    const onlyBinding = this.bindings.size === 1 ? [...this.bindings][0] : undefined;
    if (
      onlyBinding?.messageSourcePolicy === "legacy-single-webview" &&
      isAllowedOrigin(event.origin, onlyBinding.allowedOrigins)
    ) {
      onlyBinding.receive(event.data);
      return;
    }
    this.diagnose("source-required");
  }

  private destroyBinding(record: BindingRecord): Promise<void> {
    if (record.destroyPromise) return record.destroyPromise;
    record.destroyed = true;
    this.bindingByElement.delete(record.webview as object);
    this.bindings.delete(record);
    if (this.bindings.size === 0 && this.listenerInstalled) {
      this.listenerTarget.removeEventListener("message", this.onMessageBound);
      this.listenerInstalled = false;
    }
    record.destroyPromise = Promise.resolve().then(() => record.cleanup?.()).then(() => undefined);
    return record.destroyPromise;
  }

  private installListener(): void {
    if (this.listenerInstalled) return;
    this.listenerTarget.addEventListener("message", this.onMessageBound);
    this.listenerInstalled = true;
  }

  private diagnose(reason: HostRouterDiagnostic["reason"]): void {
    this.onDiagnostic?.({ type: "message-rejected", reason });
  }
}

function codedError(code: string, message: string): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
