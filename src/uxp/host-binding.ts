import { createOperationId } from "@shared/operation-id.js";
import { BRIDGE_PROTOCOL_VERSION, isBridgeSessionEnvelope } from "@shared/protocol.js";
import type {
  BridgeEstablished,
  BridgeHandshakeAck,
  BridgeHandshakeCancel,
  BridgeHandshakeCancelAck,
  BridgeHandshakeChallenge,
  BridgeHandshakeError,
  BridgeHandshakeHello,
  BridgeHandshakeReady,
  BridgeReadyAck,
  BridgeSessionConfirm
} from "@shared/types.js";
import type { BridgeCapabilityName } from "@shared/capabilities.js";
import type { UxpWebViewElement } from "./rpc-host.js";

export interface BridgeSessionOwner {
  receive(message: unknown): void | Promise<void>;
  close(reason: string): void | Promise<void>;
}

export interface HostBindingSessionFactoryContext {
  readonly bridgeSessionId: string;
  readonly clientInstanceId: string;
  readonly documentGeneration: number;
  readonly signal: AbortSignal;
}

export interface GenerationBoundHostBindingOptions {
  readonly bindingId: string;
  readonly webview: UxpWebViewElement;
  readonly capabilities: readonly BridgeCapabilityName[];
  readonly hostVersion?: string;
  readonly candidateTimeoutMs?: number;
  readonly readyAckTimeoutMs?: number;
  readonly activationTimeoutMs?: number;
  readonly generationMode?: "load-barrier" | "unsupported";
  readonly initialGenerationPhase?: "stable" | "awaiting-load";
  readonly createSession: (
    context: HostBindingSessionFactoryContext
  ) => BridgeSessionOwner | Promise<BridgeSessionOwner>;
}

interface Candidate {
  readonly candidateId: string;
  readonly clientInstanceId: string;
  readonly documentGeneration: number;
  readonly challenge: string;
  readonly expiresAt: number;
  readonly controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  phase: "challenging" | "initializing" | "ready";
  readyNonce?: string;
  bridgeSessionId?: string;
  session?: BridgeSessionOwner;
}

interface ActiveSession {
  readonly bridgeSessionId: string;
  readonly clientInstanceId: string;
  readonly documentGeneration: number;
  readonly candidateId: string;
  readonly owner: BridgeSessionOwner;
  confirmed: boolean;
  activationTimer?: ReturnType<typeof setTimeout>;
}

const DEFAULT_CANDIDATE_TIMEOUT_MS = 10_000;
const DEFAULT_READY_ACK_TIMEOUT_MS = 5_000;
const DEFAULT_ACTIVATION_TIMEOUT_MS = 5_000;

export class GenerationBoundHostBinding {
  private readonly options: GenerationBoundHostBindingOptions;
  private readonly candidates = new Map<string, Candidate>();
  private active: ActiveSession | undefined;
  private generation = 0;
  private generationPhase: "stable" | "awaiting-load";
  private deferredHello: BridgeHandshakeHello | undefined;
  private destroyed = false;
  private destroyPromise: Promise<void> | undefined;

  constructor(options: GenerationBoundHostBindingOptions) {
    this.options = options;
    this.generationPhase = options.initialGenerationPhase ?? "stable";
  }

  get state(): "waiting" | "handshaking" | "ready" | "closing" | "destroyed" {
    if (this.destroyed) return this.destroyPromise ? "closing" : "destroyed";
    if (this.active?.confirmed) return "ready";
    if (this.active || this.candidates.size > 0) return "handshaking";
    return "waiting";
  }

  get activeBridgeSessionId(): string | undefined {
    return this.active?.bridgeSessionId;
  }

  receive(message: unknown): void {
    if (this.destroyed || !isRecord(message) || typeof message.type !== "string") return;
    switch (message.type) {
      case "bridge.hello":
        this.receiveHello(message as unknown as BridgeHandshakeHello);
        return;
      case "bridge.handshake.ack":
        void this.receiveAck(message as unknown as BridgeHandshakeAck);
        return;
      case "bridge.ready.ack":
        this.receiveReadyAck(message as unknown as BridgeReadyAck);
        return;
      case "bridge.session.confirm":
        this.receiveConfirm(message as unknown as BridgeSessionConfirm);
        return;
      case "bridge.handshake.cancel":
        void this.receiveCancel(message as unknown as BridgeHandshakeCancel);
        return;
      default:
        this.receiveSessionEnvelope(message);
    }
  }

  beginDocumentGeneration(): void {
    if (this.destroyed) return;
    this.generation += 1;
    this.generationPhase = "awaiting-load";
    this.deferredHello = undefined;
    for (const candidate of [...this.candidates.values()]) {
      void this.rollbackCandidate(candidate, "generation-advanced");
    }
    if (this.active) void this.closeActive("generation-advanced");
  }

  completeDocumentGeneration(): void {
    if (this.destroyed) return;
    if (this.generationPhase === "stable") {
      this.beginDocumentGeneration();
    }
    this.generationPhase = "stable";
    const hello = this.deferredHello;
    this.deferredHello = undefined;
    if (hello) this.receiveHello(hello);
  }

  advanceDocumentGeneration(): void {
    this.beginDocumentGeneration();
    this.completeDocumentGeneration();
  }

  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.destroyed = true;
    const candidates = [...this.candidates.values()];
    const active = this.active;
    this.active = undefined;
    this.destroyPromise = Promise.allSettled([
      ...candidates.map((candidate) => this.rollbackCandidate(candidate, "binding-destroyed")),
      ...(active ? [Promise.resolve(active.owner.close("binding-destroyed"))] : [])
    ]).then((results) => {
      this.destroyPromise = undefined;
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (failed) throw failed.reason;
    });
    return this.destroyPromise;
  }

  private receiveHello(message: BridgeHandshakeHello): void {
    if (!validHello(message)) return;
    if (!isCompatibleProtocol(message.protocolVersion)) {
      this.postHandshakeError(message.clientInstanceId, codedError(
        "ERR_BRIDGE_PROTOCOL_VERSION_MISMATCH",
        `Bridge protocol ${message.protocolVersion} is incompatible with ${BRIDGE_PROTOCOL_VERSION}.`
      ));
      return;
    }
    if (
      this.options.generationMode === "load-barrier" &&
      this.generationPhase === "awaiting-load"
    ) {
      this.deferredHello = message;
      return;
    }
    if (this.active) {
      if (this.active.clientInstanceId === message.clientInstanceId) {
        this.postEstablished(this.active);
      } else {
        this.postHandshakeError(message.clientInstanceId, codedError(
          "ERR_BRIDGE_GENERATION_CONFLICT",
          "This document generation already has a committed Bridge session."
        ));
      }
      return;
    }
    const existing = [...this.candidates.values()].find(
      (candidate) => candidate.clientInstanceId === message.clientInstanceId &&
        candidate.documentGeneration === this.generation
    );
    if (existing) {
      this.postChallenge(existing);
      return;
    }
    const timeoutMs = this.options.candidateTimeoutMs ?? DEFAULT_CANDIDATE_TIMEOUT_MS;
    const candidate: Candidate = {
      candidateId: createOperationId(),
      clientInstanceId: message.clientInstanceId,
      documentGeneration: this.generation,
      challenge: createOperationId(),
      expiresAt: Date.now() + timeoutMs,
      controller: new AbortController(),
      timer: setTimeout(() => {
        void this.rollbackCandidate(candidate, "candidate-expired");
      }, timeoutMs),
      phase: "challenging"
    };
    this.candidates.set(candidate.candidateId, candidate);
    this.postChallenge(candidate);
  }

  private async receiveAck(message: BridgeHandshakeAck): Promise<void> {
    const candidate = this.matchCandidate(message);
    if (!candidate || candidate.phase !== "challenging") return;
    candidate.phase = "initializing";
    clearTimeout(candidate.timer);
    const bridgeSessionId = createOperationId();
    candidate.bridgeSessionId = bridgeSessionId;
    try {
      candidate.session = await this.options.createSession({
        bridgeSessionId,
        clientInstanceId: candidate.clientInstanceId,
        documentGeneration: candidate.documentGeneration,
        signal: candidate.controller.signal
      });
      if (candidate.controller.signal.aborted || this.candidates.get(candidate.candidateId) !== candidate) {
        await candidate.session.close("candidate-cancelled");
        return;
      }
      candidate.phase = "ready";
      candidate.readyNonce = createOperationId();
      const readyTimeoutMs = this.options.readyAckTimeoutMs ?? DEFAULT_READY_ACK_TIMEOUT_MS;
      candidate.timer = setTimeout(() => {
        void this.rollbackCandidate(candidate, "ready-ack-expired");
      }, readyTimeoutMs);
      const ready: BridgeHandshakeReady = {
        type: "bridge.ready",
        clientInstanceId: candidate.clientInstanceId,
        candidateId: candidate.candidateId,
        documentGeneration: candidate.documentGeneration,
        bridgeSessionId,
        readyNonce: candidate.readyNonce,
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        hostVersion: this.options.hostVersion ?? "0.1.0",
        capabilities: this.options.capabilities,
        navigationReplacement: this.options.generationMode === "load-barrier"
          ? "supported"
          : "unsupported",
        documentGenerationMode: this.options.generationMode ?? "unsupported"
      };
      this.options.webview.postMessage(ready);
    } catch (error) {
      await this.rollbackCandidate(candidate, "factory-failed");
      this.postHandshakeError(candidate.clientInstanceId, error);
    }
  }

  private receiveReadyAck(message: BridgeReadyAck): void {
    const candidate = this.candidates.get(message.candidateId);
    if (!candidate || candidate.phase !== "ready" || !candidate.session ||
      message.clientInstanceId !== candidate.clientInstanceId ||
      message.documentGeneration !== candidate.documentGeneration ||
      message.bridgeSessionId !== candidate.bridgeSessionId ||
      message.readyNonce !== candidate.readyNonce || this.active) return;
    clearTimeout(candidate.timer);
    this.candidates.delete(candidate.candidateId);
    const active: ActiveSession = {
      bridgeSessionId: candidate.bridgeSessionId as string,
      clientInstanceId: candidate.clientInstanceId,
      documentGeneration: candidate.documentGeneration,
      candidateId: candidate.candidateId,
      owner: candidate.session,
      confirmed: false
    };
    const activationTimeoutMs = this.options.activationTimeoutMs ?? DEFAULT_ACTIVATION_TIMEOUT_MS;
    active.activationTimer = setTimeout(() => {
      if (!active.confirmed && this.active === active) void this.closeActive("activation-timeout");
    }, activationTimeoutMs);
    this.active = active;
    this.postEstablished(active);
  }

  private receiveConfirm(message: BridgeSessionConfirm): void {
    const active = this.active;
    if (!active || message.bridgeSessionId !== active.bridgeSessionId ||
      message.clientInstanceId !== active.clientInstanceId ||
      message.documentGeneration !== active.documentGeneration) return;
    this.confirm(active);
  }

  private receiveSessionEnvelope(message: unknown): void {
    const active = this.active;
    if (!active || !isBridgeSessionEnvelope(message) ||
      message.bridgeSessionId !== active.bridgeSessionId) return;
    this.confirm(active);
    const completion = Promise.resolve(active.owner.receive(message));
    if ((message as { readonly type?: unknown }).type === "bridge.release-all") {
      void completion.finally(() => this.closeActive("client-release"));
    }
  }

  private async receiveCancel(message: BridgeHandshakeCancel): Promise<void> {
    let disposition: BridgeHandshakeCancelAck["disposition"] = "not-found";
    const candidate = message.candidateId ? this.candidates.get(message.candidateId) : undefined;
    if (candidate && exactCandidateCancel(candidate, message)) {
      await this.rollbackCandidate(candidate, "client-cancelled");
      disposition = "candidate-rolled-back";
    } else if (this.active && exactActiveCancel(this.active, message)) {
      const wasConfirmed = this.active.confirmed;
      await this.closeActive("client-cancelled");
      disposition = wasConfirmed ? "active-session-close-started" : "activating-session-closed";
    }
    const ack: BridgeHandshakeCancelAck = {
      type: "bridge.handshake.cancelled",
      clientInstanceId: message.clientInstanceId,
      ...(message.candidateId === undefined ? {} : { candidateId: message.candidateId }),
      ...(message.documentGeneration === undefined ? {} : { documentGeneration: message.documentGeneration }),
      ...(message.bridgeSessionId === undefined ? {} : { bridgeSessionId: message.bridgeSessionId }),
      disposition,
      cleanup: "completed"
    };
    this.options.webview.postMessage(ack);
  }

  private matchCandidate(message: BridgeHandshakeAck): Candidate | undefined {
    const candidate = this.candidates.get(message.candidateId);
    return candidate && message.clientInstanceId === candidate.clientInstanceId &&
      message.documentGeneration === candidate.documentGeneration &&
      message.challenge === candidate.challenge && candidate.documentGeneration === this.generation
      ? candidate
      : undefined;
  }

  private confirm(active: ActiveSession): void {
    if (active.confirmed) return;
    active.confirmed = true;
    if (active.activationTimer) clearTimeout(active.activationTimer);
  }

  private async rollbackCandidate(candidate: Candidate, reason: string): Promise<void> {
    if (this.candidates.get(candidate.candidateId) !== candidate) return;
    this.candidates.delete(candidate.candidateId);
    clearTimeout(candidate.timer);
    candidate.controller.abort();
    if (candidate.session) await candidate.session.close(reason);
  }

  private async closeActive(reason: string): Promise<void> {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    if (active.activationTimer) clearTimeout(active.activationTimer);
    await active.owner.close(reason);
  }

  private postChallenge(candidate: Candidate): void {
    const message: BridgeHandshakeChallenge = {
      type: "bridge.handshake.challenge",
      clientInstanceId: candidate.clientInstanceId,
      candidateId: candidate.candidateId,
      documentGeneration: candidate.documentGeneration,
      challenge: candidate.challenge,
      expiresAt: candidate.expiresAt
    };
    this.options.webview.postMessage(message);
  }

  private postEstablished(active: ActiveSession): void {
    const message: BridgeEstablished = {
      type: "bridge.established",
      clientInstanceId: active.clientInstanceId,
      candidateId: active.candidateId,
      documentGeneration: active.documentGeneration,
      bridgeSessionId: active.bridgeSessionId
    };
    this.options.webview.postMessage(message);
  }

  private postHandshakeError(clientInstanceId: string, error: unknown): void {
    const normalized = error instanceof Error
      ? {
          remoteName: error.name,
          remoteMessage: error.message,
          remoteStack: error.stack,
          code: typeof (error as Error & { code?: unknown }).code === "string"
            ? (error as Error & { code: string }).code
            : undefined
        }
      : { remoteName: "Error", remoteMessage: String(error) };
    const message: BridgeHandshakeError = {
      type: "bridge.handshake.error",
      clientInstanceId,
      error: normalized
    };
    this.options.webview.postMessage(message);
  }
}

function validHello(message: BridgeHandshakeHello): boolean {
  return message.type === "bridge.hello" && typeof message.protocolVersion === "string" &&
    typeof message.clientVersion === "string" && typeof message.clientInstanceId === "string" &&
    message.clientInstanceId.length > 0;
}

function isCompatibleProtocol(version: string): boolean {
  const expected = BRIDGE_PROTOCOL_VERSION.split(".").slice(0, 2).join(".");
  return version.split(".").slice(0, 2).join(".") === expected;
}

function exactCandidateCancel(candidate: Candidate, message: BridgeHandshakeCancel): boolean {
  return message.clientInstanceId === candidate.clientInstanceId &&
    message.candidateId === candidate.candidateId &&
    message.documentGeneration === candidate.documentGeneration &&
    message.challenge === candidate.challenge &&
    (message.bridgeSessionId === undefined || message.bridgeSessionId === candidate.bridgeSessionId);
}

function exactActiveCancel(active: ActiveSession, message: BridgeHandshakeCancel): boolean {
  return message.clientInstanceId === active.clientInstanceId &&
    message.candidateId === active.candidateId &&
    message.documentGeneration === active.documentGeneration &&
    message.bridgeSessionId === active.bridgeSessionId;
}

function codedError(code: string, message: string): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
