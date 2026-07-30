export interface BridgeOwnedModalRequest<T> {
  readonly bridgeSessionId: string;
  readonly operationId: string;
  readonly signal: AbortSignal;
  readonly execute: () => T | Promise<T>;
}

interface QueueItem extends BridgeOwnedModalRequest<unknown> {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  started: boolean;
  cancelled: boolean;
  readonly onAbort: () => void;
}

/** UXP-realm FIFO for top-level modal work submitted through this bridge only. */
export class BridgeOwnedModalCoordinator {
  private readonly queue: QueueItem[] = [];
  private active: QueueItem | undefined;

  get activeBridgeSessionId(): string | undefined {
    return this.active?.bridgeSessionId;
  }

  get waitingDepth(): number {
    return this.queue.length;
  }

  run<T>(request: BridgeOwnedModalRequest<T>): Promise<T> {
    if (request.signal.aborted) {
      return Promise.reject(cancelledError(request.operationId));
    }
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem = {
        ...request,
        resolve: (value) => resolve(value as T),
        reject,
        started: false,
        cancelled: false,
        onAbort: () => {
          if (item.started) return;
          item.cancelled = true;
          this.removeWaiting(item);
          reject(cancelledError(item.operationId));
        }
      };
      request.signal.addEventListener("abort", item.onAbort, { once: true });
      this.queue.push(item);
      this.drain();
    });
  }

  cancelWaiting(bridgeSessionId: string): void {
    for (const item of [...this.queue]) {
      if (item.bridgeSessionId !== bridgeSessionId || item.started) continue;
      item.cancelled = true;
      this.removeWaiting(item);
      item.reject(cancelledError(item.operationId));
    }
  }

  private drain(): void {
    if (this.active) return;
    const next = this.queue.shift();
    if (!next) return;
    next.signal.removeEventListener("abort", next.onAbort);
    if (next.cancelled || next.signal.aborted) {
      next.reject(cancelledError(next.operationId));
      this.drain();
      return;
    }
    next.started = true;
    this.active = next;
    void Promise.resolve()
      .then(next.execute)
      .then((value) => {
        if (this.active === next) this.active = undefined;
        this.drain();
        next.resolve(value);
      }, (reason) => {
        if (this.active === next) this.active = undefined;
        this.drain();
        next.reject(reason);
      });
  }

  private removeWaiting(item: QueueItem): void {
    const index = this.queue.indexOf(item);
    if (index >= 0) this.queue.splice(index, 1);
    item.signal.removeEventListener("abort", item.onAbort);
  }
}

function cancelledError(operationId: string): Error & { readonly code: string } {
  const error = new Error(`Bridge modal request ${operationId} was cancelled before native entry.`) as Error & {
    code: string;
  };
  error.code = "ERR_BRIDGE_MODAL_QUEUE_CANCELLED";
  return error;
}
