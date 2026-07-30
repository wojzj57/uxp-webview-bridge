export type QuarantineDisposition = "pending" | "timed-out" | "rejected";
export type ReplacementPolicy = "allowed" | "blocked-until-finalized";

export interface QuarantinedOwner {
  readonly token: string;
  readonly bridgeSessionId: string;
  readonly kind: string;
  readonly replacementKey?: string;
  readonly disposition: QuarantineDisposition;
  readonly replacementPolicy: ReplacementPolicy;
}

/** Realm-owned fence for cleanup work that outlives its Bridge session. */
export class QuarantineManager {
  private nextToken = 0;
  private readonly records = new Map<string, QuarantinedOwner>();
  private readonly blockedByReplacementKey = new Map<string, string>();

  quarantine(options: {
    readonly bridgeSessionId: string;
    readonly kind: string;
    readonly replacementKey?: string;
    readonly disposition: QuarantineDisposition;
    readonly replacementPolicy: ReplacementPolicy;
    readonly lateSettlement?: Promise<unknown>;
  }): QuarantinedOwner {
    const token = `quarantine-${++this.nextToken}`;
    const record: QuarantinedOwner = { token, ...options };
    this.records.set(token, record);
    if (record.replacementPolicy === "blocked-until-finalized" && record.replacementKey) {
      this.blockedByReplacementKey.set(record.replacementKey, token);
    }
    if (options.lateSettlement) {
      void options.lateSettlement.finally(() => this.finalize(token));
    }
    return record;
  }

  begin(options: {
    readonly bridgeSessionId: string;
    readonly kind: string;
    readonly replacementKey: string;
  }): QuarantinedOwner {
    return this.quarantine({
      ...options,
      disposition: "pending",
      replacementPolicy: "blocked-until-finalized"
    });
  }

  settle(token: string, settlement: {
    readonly disposition: "completed" | "timed-out" | "rejected";
    readonly completion?: Promise<unknown>;
  }): void {
    const record = this.records.get(token);
    if (!record) return;
    if (settlement.disposition !== "timed-out") {
      this.finalize(token);
      return;
    }
    this.records.set(token, { ...record, disposition: "timed-out" });
    if (settlement.completion) void settlement.completion.finally(() => this.finalize(token));
  }

  assertReplacementAllowed(replacementKey: string): void {
    const token = this.blockedByReplacementKey.get(replacementKey);
    if (!token) return;
    const error = new Error(
      `Replacement owner ${replacementKey} is fenced by unfinished quarantined cleanup.`
    ) as Error & { code: string; quarantineToken: string };
    error.code = "ERR_BRIDGE_OWNER_QUARANTINED";
    error.quarantineToken = token;
    throw error;
  }

  snapshot(): readonly QuarantinedOwner[] {
    return [...this.records.values()];
  }

  private finalize(token: string): void {
    const record = this.records.get(token);
    if (!record) return;
    this.records.delete(token);
    if (record.replacementKey && this.blockedByReplacementKey.get(record.replacementKey) === token) {
      this.blockedByReplacementKey.delete(record.replacementKey);
    }
  }
}
