import { BridgeRemoteError } from "@shared/errors.js";
import { createOperationId } from "@shared/operation-id.js";

/**
 * A Promise for a remote object that also exposes that object's members before it resolves.
 *
 * Awaiting the result returns the canonical remote object. Accessing a member first creates a
 * deferred member access, which lets callers use `await app.activeDocument.name` while preserving
 * the existing `await (await app.activeDocument).name` form.
 */
export type RemoteResult<T extends object | null | undefined> = Promise<T> & NonNullable<T>;

const REMOTE_RESULT_PATH = Symbol("RemoteResult.path");
const NO_FAILURE = Symbol("RemoteOperationScheduler.noFailure");

interface PendingFailure {
  readonly error: unknown;
  rejectThrough: number;
}

/**
 * Serializes writes owned by one remote object and gates later operations behind those writes while
 * allowing callback-reentrant reads/methods and unrelated objects to proceed. Queued write failures
 * are reported by dependent operations, then the scheduler recovers.
 */
export class RemoteOperationScheduler {
  #writeTail: Promise<void> = Promise.resolve();
  #externalWrites = new Set<Promise<void>>();
  #issued = 0;
  #lastObservableIssued = 0;
  #failure: PendingFailure | typeof NO_FAILURE = NO_FAILURE;

  run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    const sequence = ++this.#issued;
    this.#lastObservableIssued = sequence;
    if (this.#failure !== NO_FAILURE) {
      this.#failure.rejectThrough = sequence;
    }
    const barriers = [this.#writeTail, ...this.#externalWrites];
    return Promise.all(barriers).then(() => {
      this.#throwPendingFailure(sequence);
      return operation();
    });
  }

  enqueueWrite(operation: () => void | PromiseLike<void>): void {
    void this.write(operation).catch(() => undefined);
  }

  write(operation: () => void | PromiseLike<void>, bypassExternalWrites = false): Promise<void> {
    const sequence = ++this.#issued;
    const externalWrites = bypassExternalWrites ? [] : [...this.#externalWrites];
    const promise = Promise.all([this.#writeTail, ...externalWrites]).then(async () => {
      this.#throwPendingFailure(sequence, false);
      try {
        await operation();
      } catch (error) {
        this.#recordFailure(error, sequence);
        throw error;
      }
    });
    this.#writeTail = promise.then(
      () => undefined,
      () => undefined
    );
    return promise;
  }

  /** Register a descendant write immediately so later operations wait for it. */
  trackExternalWrite(write: PromiseLike<void>): void {
    const sequence = ++this.#issued;
    let tracked: Promise<void>;
    tracked = Promise.resolve(write)
      .catch((error: unknown) => {
        this.#recordFailure(error, sequence);
      })
      .finally(() => {
        this.#externalWrites.delete(tracked);
      });
    this.#externalWrites.add(tracked);
  }

  #throwPendingFailure(sequence: number, observable = true): void {
    const failure = this.#failure;
    if (failure === NO_FAILURE) return;
    if (!observable) {
      // Setters cannot expose their returned Promise, so they must not consume a pending failure.
      throw failure.error;
    }
    if (sequence >= failure.rejectThrough) {
      this.#failure = NO_FAILURE;
    }
    throw failure.error;
  }

  #recordFailure(error: unknown, failedSequence: number): void {
    if (this.#failure !== NO_FAILURE) return;
    this.#failure = {
      error,
      rejectThrough: this.#lastObservableIssued > failedSequence ? this.#lastObservableIssued : 0
    };
  }
}

export const REMOTE_RESULT_SET = Symbol("RemoteResult.set");
export const REMOTE_RESULT_SCHEDULER = Symbol("RemoteResult.scheduler");

export interface RemoteResultTarget {
  readonly [REMOTE_RESULT_SCHEDULER]: RemoteOperationScheduler;
  [REMOTE_RESULT_SET](name: PropertyKey, value: unknown, bypassExternalWrites?: boolean): Promise<void>;
}

interface ResultState {
  readonly promise: Promise<unknown>;
  readonly scheduler: RemoteOperationScheduler;
  readonly path: string;
}

interface MemberState {
  readonly member: Promise<{ readonly receiver: unknown; readonly value: unknown }>;
  readonly scheduler: RemoteOperationScheduler;
  readonly path: string;
}

/** Build a chainable Promise around an eagerly-started remote-object operation. */
export function createRemoteResult<T extends object | null | undefined>(
  promise: Promise<T>,
  scheduler = new RemoteOperationScheduler(),
  path = "remote result"
): RemoteResult<T> {
  const state: ResultState = { promise, scheduler, path };
  return new Proxy(promise, {
    get(target, property) {
      if (property === REMOTE_RESULT_PATH) return path;
      if (property === "then" || property === "catch" || property === "finally") {
        const settled = scheduler.run(() => promise);
        return bindPromiseMethod(settled, property);
      }
      if (property === Symbol.toStringTag) return "Promise";
      return createMemberAccess(state, property);
    },
    set(_target, property, value) {
      enqueueResultWrite(state, property, value);
      return true;
    }
  }) as RemoteResult<T>;
}

function createMemberAccess(parent: ResultState, property: PropertyKey): unknown {
  const path = appendPath(parent.path, property);
  const member = parent.scheduler.run(async () => {
    const receiver = requireResolvedObject(await parent.promise, parent.path);
    return { receiver, value: Reflect.get(receiver, property, receiver) };
  });
  return createMemberNode({ member, scheduler: parent.scheduler, path });
}

function createNestedMemberAccess(parent: MemberState, property: PropertyKey): unknown {
  const path = appendPath(parent.path, property);
  const member = parent.scheduler.run(async () => {
    const receiver = requireResolvedObject(await resolveMember(parent), parent.path);
    return { receiver, value: Reflect.get(receiver, property, receiver) };
  });
  return createMemberNode({ member, scheduler: parent.scheduler, path });
}

function createMemberNode(state: MemberState): unknown {
  // An arrow target has no non-configurable own `caller`/`arguments` properties, so those names can
  // still be forwarded when a remote API legitimately exposes them.
  const callable = (): never => {
    throw new Error("Remote member access must be invoked through its proxy.");
  };
  return new Proxy(callable, {
    get(_target, property) {
      if (property === REMOTE_RESULT_PATH) return state.path;
      if (property === "then" || property === "catch" || property === "finally") {
        const settled = resolveMember(state);
        return bindPromiseMethod(settled, property);
      }
      if (property === Symbol.toStringTag) return "Promise";
      return createNestedMemberAccess(state, property);
    },
    set(_target, property, value) {
      const target: ResultState = {
        promise: resolveMember(state),
        scheduler: state.scheduler,
        path: state.path
      };
      enqueueResultWrite(target, property, value);
      return true;
    },
    apply(_target, _thisArg, args) {
      const path = `${state.path}()`;
      const promise = state.scheduler.run(async () => {
        const { receiver, value } = await state.member;
        if (typeof value !== "function") {
          throw new TypeError(`${state.path} is not callable.`);
        }
        return Reflect.apply(value, receiver, args);
      });
      return createRemoteResult(
        promise.then((value) => value as object | null | undefined),
        state.scheduler,
        path
      );
    }
  });
}

function enqueueResultWrite(state: ResultState, property: PropertyKey, value: unknown): void {
  const write = (async () => {
    const target = requireResolvedObject(await state.promise, state.path);
    if (isRemoteResultTarget(target)) {
      const targetScheduler = target[REMOTE_RESULT_SCHEDULER];
      await target[REMOTE_RESULT_SET](property, value, targetScheduler === state.scheduler);
      return;
    }
    if (!Reflect.set(target, property, value, target)) {
      throw new TypeError(`Cannot assign ${appendPath(state.path, property)}.`);
    }
  })();
  state.scheduler.trackExternalWrite(write);
}

async function resolveMember(state: MemberState): Promise<unknown> {
  const { value } = await state.member;
  return value;
}

function requireResolvedObject(value: unknown, path: string): object {
  if (value == null) {
    throw new BridgeRemoteError({
      operationId: createOperationId(),
      remoteName: "RemoteNullReferenceError",
      remoteMessage: `${path} resolved to ${String(value)} and cannot be dereferenced.`,
      code: "BRIDGE_NULL_REMOTE_RESULT"
    });
  }
  if ((typeof value !== "object" && typeof value !== "function")) {
    throw new TypeError(`${path} did not resolve to an object.`);
  }
  return value;
}

function isRemoteResultTarget(value: object): value is object & RemoteResultTarget {
  return (
    REMOTE_RESULT_SCHEDULER in value &&
    REMOTE_RESULT_SET in value &&
    typeof (value as Partial<RemoteResultTarget>)[REMOTE_RESULT_SET] === "function"
  );
}

function appendPath(path: string, property: PropertyKey): string {
  return typeof property === "symbol" ? `${path}[${String(property)}]` : `${path}.${property}`;
}

function bindPromiseMethod(
  promise: Promise<unknown>,
  method: "then" | "catch" | "finally"
): Promise<unknown>[typeof method] {
  return promise[method].bind(promise) as Promise<unknown>[typeof method];
}
