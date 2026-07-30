import type { QuarantineManager, ReplacementPolicy } from "./quarantine-manager.js";

export interface BridgeSessionCleanupOwner {
  readonly name: string;
  readonly kind?: string;
  readonly replacementKey?: string;
  readonly replacementPolicy?: ReplacementPolicy;
  readonly cleanup: () => void | Promise<void>;
}

export interface BridgeSessionClosePolicy {
  readonly drainDeadlineMs: number;
  readonly ownerDeadlineMs: number;
  readonly totalDeadlineMs: number;
}

export interface BoundedBridgeSessionOptions {
  readonly bridgeSessionId: string;
  readonly receive: (message: unknown) => void | Promise<void>;
  /** Synchronously revokes routing/authority before any async drain begins. */
  readonly revoke: () => void;
  readonly drain: () => void | Promise<void>;
  readonly owners: readonly BridgeSessionCleanupOwner[];
  readonly quarantineManager?: QuarantineManager;
  readonly policy?: Partial<BridgeSessionClosePolicy>;
}

interface CleanupFailure {
  readonly owner: string;
  readonly disposition: "timed-out" | "rejected";
  readonly reason?: unknown;
}

const DEFAULT_POLICY: BridgeSessionClosePolicy = {
  drainDeadlineMs: 5_000,
  ownerDeadlineMs: 5_000,
  totalDeadlineMs: 30_000
};

/** A one-way session tombstone with bounded, all-attempt cleanup. */
export class BoundedBridgeSession {
  private readonly options: BoundedBridgeSessionOptions;
  private readonly policy: BridgeSessionClosePolicy;
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly cleanupFences = new Map<BridgeSessionCleanupOwner, string>();

  constructor(options: BoundedBridgeSessionOptions) {
    this.options = options;
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
  }

  get state(): "open" | "closed" {
    return this.closed ? "closed" : "open";
  }

  receive(message: unknown): void | Promise<void> {
    if (this.closed) return;
    return this.options.receive(message);
  }

  close(_reason: string): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    this.options.revoke();
    for (const owner of this.options.owners) {
      if (owner.replacementPolicy !== "blocked-until-finalized" || !owner.replacementKey) continue;
      const fence = this.options.quarantineManager?.begin({
        bridgeSessionId: this.options.bridgeSessionId,
        kind: owner.kind ?? owner.name,
        replacementKey: owner.replacementKey
      });
      if (fence) this.cleanupFences.set(owner, fence.token);
    }
    this.closePromise = this.closeWithinBudget();
    return this.closePromise;
  }

  private async closeWithinBudget(): Promise<void> {
    const startedAt = Date.now();
    const failures: CleanupFailure[] = [];
    const drain = await settleBy(this.options.drain, this.deadline(startedAt, this.policy.drainDeadlineMs));
    if (drain.disposition !== "completed") {
      failures.push({ owner: "in-flight-drain", ...drain });
    }
    for (const owner of [...this.options.owners].reverse()) {
      const cleanupFenceToken = this.cleanupFences.get(owner);
      const remaining = this.policy.totalDeadlineMs - (Date.now() - startedAt);
      const result = await settleBy(owner.cleanup, Math.max(0, Math.min(this.policy.ownerDeadlineMs, remaining)));
      if (cleanupFenceToken) {
        this.options.quarantineManager?.settle(cleanupFenceToken, {
          disposition: result.disposition,
          ...(result.disposition === "timed-out" ? { completion: result.completion } : {})
        });
      }
      if (result.disposition !== "completed") {
        failures.push({ owner: owner.name, ...result });
        if (!cleanupFenceToken) this.options.quarantineManager?.quarantine({
          bridgeSessionId: this.options.bridgeSessionId,
          kind: owner.kind ?? owner.name,
          disposition: result.disposition,
          replacementPolicy: owner.replacementPolicy ?? "allowed",
          ...(owner.replacementKey === undefined ? {} : { replacementKey: owner.replacementKey }),
          ...(result.disposition === "timed-out" ? { lateSettlement: result.completion } : {})
        });
      }
    }
    if (failures.length > 0) throw cleanupError(this.options.bridgeSessionId, failures);
  }

  private deadline(startedAt: number, requested: number): number {
    return Math.max(0, Math.min(requested, this.policy.totalDeadlineMs - (Date.now() - startedAt)));
  }
}

type Settlement =
  | { readonly disposition: "completed" }
  | { readonly disposition: "timed-out"; readonly completion: Promise<unknown> }
  | { readonly disposition: "rejected"; readonly reason: unknown };

function settleBy(action: () => void | Promise<void>, timeoutMs: number): Promise<Settlement> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const actionResult = Promise.resolve().then(action).then<Settlement, Settlement>(
    () => ({ disposition: "completed" }),
    (reason: unknown) => ({ disposition: "rejected", reason })
  );
  const timeout = new Promise<Settlement>((resolve) => {
    timer = setTimeout(() => resolve({ disposition: "timed-out", completion: actionResult }), timeoutMs);
  });
  return Promise.race([actionResult, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function cleanupError(bridgeSessionId: string, failures: readonly CleanupFailure[]): Error & {
  readonly code: string;
  readonly bridgeSessionId: string;
  readonly failures: readonly CleanupFailure[];
} {
  const error = new Error(`Bridge session cleanup did not complete for ${failures.length} owner(s).`) as Error & {
    code: string;
    bridgeSessionId: string;
    failures: readonly CleanupFailure[];
  };
  error.name = "BridgeSessionCleanupError";
  error.code = failures.some((failure) => failure.owner === "in-flight-drain" && failure.disposition === "timed-out")
    ? "ERR_BRIDGE_SESSION_DRAIN_TIMEOUT"
    : "ERR_BRIDGE_SESSION_CLEANUP";
  error.bridgeSessionId = bridgeSessionId;
  error.failures = failures;
  return error;
}
