import type { BridgeNestedModalContext } from "../shared/protocol.js";

/**
 * Owns modal authority for the lifetime of one awaited callback invocation.
 * Different modal sessions are serialized so one invocation can never observe
 * another invocation's authority through the shared namespace exports.
 */
export class CallbackInvocationContextCarrier {
  private active: { readonly context: BridgeNestedModalContext; depth: number } | undefined;
  private tail: Promise<void> = Promise.resolve();
  private invalidated = false;

  get current(): BridgeNestedModalContext | undefined {
    return this.active?.context;
  }

  run<T>(context: BridgeNestedModalContext, invoke: () => T | Promise<T>): Promise<T> {
    if (this.invalidated) return Promise.reject(closedError());
    if (this.active?.context.modalSessionId === context.modalSessionId) {
      return this.runNested(context, invoke);
    }
    const started = this.tail.then(() => this.runOwned(context, invoke));
    this.tail = started.then(() => undefined, () => undefined);
    return started;
  }

  invalidate(): void {
    this.invalidated = true;
    this.active = undefined;
  }

  private async runOwned<T>(
    context: BridgeNestedModalContext,
    invoke: () => T | Promise<T>
  ): Promise<T> {
    if (this.invalidated) throw closedError();
    this.active = { context, depth: 1 };
    try {
      return await invoke();
    } finally {
      if (this.active?.context.callbackInvocationId === context.callbackInvocationId) {
        this.active = undefined;
      }
    }
  }

  private async runNested<T>(
    context: BridgeNestedModalContext,
    invoke: () => T | Promise<T>
  ): Promise<T> {
    const active = this.active;
    if (!active) return this.runOwned(context, invoke);
    active.depth += 1;
    try {
      return await invoke();
    } finally {
      active.depth -= 1;
      if (active.depth === 0 && this.active === active) this.active = undefined;
    }
  }
}

function closedError(): Error & { readonly code: string } {
  const error = new Error("The callback invocation context carrier is closed.") as Error & {
    code: string;
  };
  error.code = "ERR_BRIDGE_SESSION_CLOSED";
  return error;
}
