import type { UxpModuleAdapter } from "./module-registry.js";

export interface AdapterOwnerFactoryStep {
  readonly name: string;
  readonly create: (signal?: AbortSignal) => UxpModuleAdapter | Promise<UxpModuleAdapter>;
}

export interface AdapterOwnerRollbackPolicy {
  readonly ownerDeadlineMs: number;
  readonly totalDeadlineMs: number;
}

interface RollbackFailure {
  readonly owner: string;
  readonly disposition: "timed-out" | "rejected";
  readonly reason?: unknown;
}

const DEFAULT_ROLLBACK_POLICY: AdapterOwnerRollbackPolicy = {
  ownerDeadlineMs: 5_000,
  totalDeadlineMs: 30_000
};

/** Constructs adapter owners transactionally and rolls back a partial set on failure. */
export async function constructAdapterOwners(
  steps: readonly AdapterOwnerFactoryStep[],
  policy: Partial<AdapterOwnerRollbackPolicy> = {},
  signal?: AbortSignal
): Promise<readonly UxpModuleAdapter[]> {
  const effectivePolicy = { ...DEFAULT_ROLLBACK_POLICY, ...policy };
  const created: { readonly name: string; readonly adapter: UxpModuleAdapter }[] = [];
  try {
    for (const step of steps) {
      created.push({
        name: step.name,
        adapter: await createOwner(step, signal, effectivePolicy)
      });
    }
    return created.map(({ adapter }) => adapter);
  } catch (cause) {
    const rollbackFailures = await rollback(created, effectivePolicy);
    throw constructionError(cause, rollbackFailures);
  }
}

function createOwner(
  step: AdapterOwnerFactoryStep,
  signal: AbortSignal | undefined,
  policy: AdapterOwnerRollbackPolicy
): Promise<UxpModuleAdapter> {
  if (signal?.aborted) return Promise.reject(candidateAbortedError(signal.reason));
  const creation = Promise.resolve().then(() => step.create(signal));
  if (!signal) return creation;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(candidateAbortedError(signal.reason));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([creation, aborted]).catch((error: unknown) => {
    if (signal.aborted) {
      void creation.then((adapter) => rollback([{ name: step.name, adapter }], policy)).catch(() => undefined);
    }
    throw error;
  }).finally(() => {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  });
}

async function rollback(
  created: readonly { readonly name: string; readonly adapter: UxpModuleAdapter }[],
  policy: AdapterOwnerRollbackPolicy
): Promise<readonly RollbackFailure[]> {
  const startedAt = Date.now();
  const failures: RollbackFailure[] = [];
  for (const owner of [...created].reverse()) {
    const remaining = policy.totalDeadlineMs - (Date.now() - startedAt);
    const result = await settleBy(
      () => owner.adapter.destroy?.(),
      Math.max(0, Math.min(policy.ownerDeadlineMs, remaining))
    );
    if (result.disposition !== "completed") {
      failures.push({ owner: owner.name, ...result });
    }
  }
  return failures;
}

type Settlement =
  | { readonly disposition: "completed" }
  | { readonly disposition: "timed-out" }
  | { readonly disposition: "rejected"; readonly reason: unknown };

function settleBy(action: () => void | Promise<void> | undefined, timeoutMs: number): Promise<Settlement> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const completion = Promise.resolve().then(action).then<Settlement, Settlement>(
    () => ({ disposition: "completed" }),
    (reason: unknown) => ({ disposition: "rejected", reason })
  );
  const timeout = new Promise<Settlement>((resolve) => {
    timer = setTimeout(() => resolve({ disposition: "timed-out" }), timeoutMs);
  });
  return Promise.race([completion, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function constructionError(
  cause: unknown,
  rollbackFailures: readonly RollbackFailure[]
): Error & {
  readonly code: string;
  readonly cause: unknown;
  readonly rollbackFailures: readonly RollbackFailure[];
} {
  const error = new Error("Bridge adapter-owner construction failed and was rolled back.") as Error & {
    code: string;
    cause: unknown;
    rollbackFailures: readonly RollbackFailure[];
  };
  error.name = "BridgeAdapterConstructionError";
  error.code = "ERR_BRIDGE_ADAPTER_CONSTRUCTION";
  error.cause = cause;
  error.rollbackFailures = rollbackFailures;
  return error;
}

function candidateAbortedError(reason: unknown): Error & { readonly code: string; readonly reason: unknown } {
  const error = new Error("Bridge adapter-owner construction was cancelled with its handshake candidate.") as Error & {
    code: string;
    reason: unknown;
  };
  error.name = "BridgeCandidateAbortedError";
  error.code = "ERR_BRIDGE_CANDIDATE_ABORTED";
  error.reason = reason;
  return error;
}
