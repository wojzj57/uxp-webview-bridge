import type { RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import {
  encodeRemoteArgs,
  type RemoteArgEncoder,
  type RemoteReferenceHolder,
  type RemoteValueDecoder
} from "./reference.js";
import {
  createRemoteResult,
  REMOTE_RESULT_SCHEDULER,
  REMOTE_RESULT_SET,
  RemoteOperationScheduler
} from "./remote-result.js";

/**
 * Minimal RPC surface a {@link RemoteClass} needs. Matches the WebView bridge rpc client.
 */
export interface RemoteRpc {
  readonly bridgeSessionId: string;
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
  bindReference?(reference: RemoteReference): Promise<RemoteReference>;
  assertReferenceActive?(reference: RemoteReference): void;
}

/**
 * Declarative result-typing for a property read or method return (ADR 0009). Instead of injecting a
 * `decode` closure, a photoshop descriptor names *what* the result is; the injected
 * {@link RemoteDecodeContext} resolves the name at decode time (lazily, which is what breaks the
 * cyclic-reference and factory-construction-order problems). Exactly one of these may be set.
 *
 * `refType`      — a single remote object of this remote type (nullable if the reply is null).
 * `valueKind`    — a value object resolved via the value-object registry.
 * `collectionOf` — a snapshot collection whose members are of this remote type.
 */
export interface RemoteResultTyping {
  readonly refType?: string;
  readonly refTypes?: readonly string[];
  readonly valueKind?: string;
  readonly collectionOf?: string;
  /** Explicit chainable-object marker for modules that decode references through `decode`. */
  readonly remoteResult?: boolean;
}

/**
 * Resolver injected into a {@link RemoteClass} to decode declarative result typings. A module wires
 * this once (photoshop builds it from its type/value/collection registries); non-photoshop modules
 * (xmp) omit it and rely on the `decode` closure escape hatch instead.
 */
export interface RemoteDecodeContext {
  /** Decode a single remote reference envelope (or null) into a `===`-stable instance. */
  decodeRef(refType: string, raw: unknown): unknown;
  /** Decode a reference whose concrete type is one of the declared alternatives. */
  decodeRefUnion(refTypes: readonly string[], raw: unknown): unknown;
  /** Decode a value-object envelope into a plain value object. */
  decodeValue(valueKind: string, raw: unknown): unknown;
  /** Decode a snapshot envelope into a collection of the given member type. */
  decodeCollection(memberKind: string, raw: unknown): unknown;
}

/**
 * Runtime descriptor for a single remote property.
 *
 * `writable` controls whether a setter is generated; `mutating` is forwarded to the UXP host so it
 * can decide modal-execution semantics (unused by non-Photoshop modules such as XMP).
 *
 * Result typing is declarative via {@link RemoteResultTyping} (`refType`/`valueKind`/`collectionOf`,
 * resolved by the injected {@link RemoteDecodeContext}); `decode` remains as a low-level escape
 * hatch for modules without a decode context (xmp). At most one mechanism applies per descriptor.
 *
 * `remoteKey` supports a shared getter/setter RPC that dispatches on a property name (e.g. XMP's
 * `xmp.dateTime.getProperty`/`setProperty`): when set, the get call sends `[reference, remoteKey]`
 * and the set call sends `[reference, remoteKey, value]`. When omitted, each property uses its own
 * dedicated RPC method (`[reference]` / `[reference, value]`).
 */
export interface RemotePropertyDescriptor extends RemoteResultTyping {
  readonly writable: boolean;
  readonly mutating?: boolean;
  readonly decode?: RemoteValueDecoder;
  readonly remoteKey?: string;
}

/**
 * Runtime descriptor for a single remote method.
 *
 * Result typing is declarative via {@link RemoteResultTyping}; `decode` remains as an escape hatch.
 * `mutating` is forwarded for host modal semantics.
 */
export interface RemoteMethodDescriptor extends RemoteResultTyping {
  readonly mutating?: boolean;
  readonly decode?: RemoteValueDecoder;
}

/**
 * Per-subclass configuration resolved once and shared by all its instances. Subclasses build this
 * (typically from their static descriptor tables) and hand it to `super(...)`.
 */
export interface RemoteClassConfig {
  readonly rpc: RemoteRpc;
  readonly moduleId: string;
  /**
   * Maps a logical property/method key to its RPC method name, e.g. `name` -> `"xmp.dateTime.year"`.
   * Also carries the batch and dispose method names.
   */
  readonly methodNames: RemoteMethodNames;
  readonly properties: Readonly<Record<string, RemotePropertyDescriptor>>;
  readonly methods: Readonly<Record<string, RemoteMethodDescriptor>>;
  /** Domain arg encoders (e.g. XMP native-Date envelope). RemoteClass instances are always encoded. */
  readonly argEncoders?: readonly RemoteArgEncoder[];
  /**
   * Resolver for declarative result typings (`refType`/`valueKind`/`collectionOf`). Required when
   * any descriptor uses them; omitted by modules that rely solely on the `decode` closure.
   */
  readonly decodeContext?: RemoteDecodeContext;
}

export interface RemoteMethodNames {
  /** Logical property key -> RPC read method name. */
  readonly propertyGet: Readonly<Record<string, string>>;
  /** Logical property key -> RPC write method name. */
  readonly propertySet: Readonly<Record<string, string>>;
  /** Logical method key -> RPC method name. */
  readonly method: Readonly<Record<string, string>>;
  readonly batchGet?: string;
  readonly batchSet?: string;
  readonly dispose: string;
}

/** Resolve the selected remote property types after the outer batch Promise settles. */
export type RemoteBatchGetResult<TProperties, K extends keyof TProperties> = {
  [P in K]: Awaited<TProperties[P]>;
};

/** Uniform empty batch surface for RemoteClasses that declare no remote properties. */
export interface EmptyRemoteBatchOperations {
  batchGet(propertyNames: readonly never[]): Promise<Record<never, never>>;
  batchSet(properties: Readonly<Record<string, never>>): Promise<void>;
}

/** Internal symbol used by RemoteClass subclasses for bound sub-namespaces such as Document.saveAs. */
export const REMOTE_INVOKE = Symbol("RemoteClass.invokeRemote");

/** Describes the construction RPC for a brand-new remote object. */
export interface RemoteConstructionRequest {
  readonly method: string;
  /** Already transport-encoded (constructor args are encoded synchronously by the subclass). */
  readonly args: readonly unknown[];
}

/**
 * Generic WebView base for stateful remote DOM objects.
 *
 * Holds the remote reference and a per-instance write queue, and — driven by the subclass's
 * descriptor tables — generates async property getters, queued property setters, and remote method
 * wrappers, plus `batchGet` / `batchSet`. All bridge communication lives here; subclasses are pure
 * declarations. See docs/adr/0002 and docs/adr/0008.
 */
export abstract class RemoteClass<
  TReadableProperties extends object = Record<string, unknown>,
  TReadableKey extends keyof TReadableProperties & string = keyof TReadableProperties & string,
  TBatchSetProperties extends object = Record<string, unknown>
> implements RemoteReferenceHolder {
  readonly #config: RemoteClassConfig;
  readonly #referencePromise: Promise<RemoteReference>;
  readonly #scheduler = new RemoteOperationScheduler();

  protected constructor(config: RemoteClassConfig, source: RemoteReference | RemoteConstructionRequest) {
    assertNoPromiseLikeRemoteMembers(config);
    assertBatchMethodsConfigured(config);
    this.#config = config;
    this.#referencePromise = isConstructionRequest(source)
      ? config.rpc.call<RemoteReference>(config.moduleId, source.method, source.args)
      : config.rpc.bindReference?.(source) ?? Promise.resolve(source);

    this.#defineMembers();
  }

  async toRemoteReference(): Promise<RemoteReference> {
    return this.#ownedReference();
  }

  dispose(): Promise<void> {
    return this.#scheduler.run(async () => {
      const reference = await this.#ownedReference();
      await this.#config.rpc.call<void>(this.#config.moduleId, this.#config.methodNames.dispose, [reference]);
    });
  }

  get [REMOTE_RESULT_SCHEDULER](): RemoteOperationScheduler {
    return this.#scheduler;
  }

  [REMOTE_RESULT_SET](name: PropertyKey, value: unknown, bypassExternalWrites = false): Promise<void> {
    if (typeof name !== "string") {
      return Promise.reject(new TypeError(`Remote property names must be strings: ${String(name)}`));
    }
    const descriptor = this.#config.properties[name];
    if (!descriptor?.writable) {
      return Promise.reject(new TypeError(`Cannot assign non-writable remote property: ${name}`));
    }
    return this.#scheduler.write(() => this.#writeProperty(name, value), bypassExternalWrites);
  }

  /**
   * Invoke an RPC owned by a subclass-local bound namespace while preserving this instance's
   * reference, queued-write ordering, recursive argument encoding, and result decoding.
   */
  protected [REMOTE_INVOKE]<T>(
    method: string,
    args: readonly unknown[] = [],
    result?: RemoteResultTyping & { readonly decode?: RemoteValueDecoder }
  ): Promise<T> {
    const promise = this.#scheduler.run(async () => {
      const reference = await this.#ownedReference();
      const encoded = await encodeRemoteArgs(args, this.#config.argEncoders);
      const raw = await this.#config.rpc.call<unknown>(this.#config.moduleId, method, [reference, ...encoded]);
      return this.#decodeResult(result, raw) as T;
    });
    return this.#wrapRemoteResult(promise, result, method) as Promise<T>;
  }

  /** Read multiple properties of this object in a single RPC. */
  async batchGet<K extends TReadableKey>(
    propertyNames: readonly K[]
  ): Promise<RemoteBatchGetResult<TReadableProperties, K>> {
    const names = normalizeBatchGetNames(propertyNames, this.#config.properties);
    if (names.length === 0) {
      return {} as RemoteBatchGetResult<TReadableProperties, K>;
    }
    const method = this.#requireMethodName(this.#config.methodNames.batchGet, "batch get properties");
    return this.#scheduler.run(async () => {
      const reference = await this.#ownedReference();
      const raw = await this.#config.rpc.call<Record<string, unknown>>(this.#config.moduleId, method, [
        reference,
        names
      ]);

      const result = {} as RemoteBatchGetResult<TReadableProperties, K>;
      for (const name of names) {
        result[name] = this.#decodeProperty(name, raw[name]) as Awaited<TReadableProperties[typeof name]>;
      }
      return result;
    });
  }

  /** Set multiple writable properties of this object in one explicit, awaitable RPC. */
  async batchSet(properties: Readonly<TBatchSetProperties>): Promise<void> {
    const snapshot = snapshotBatchSetProperties(properties);
    const names = Object.keys(snapshot);
    for (const name of names) {
      const descriptor = this.#config.properties[name];
      if (!descriptor || !descriptor.writable) {
        throw new TypeError(`Cannot batchSet non-writable property: ${name}`);
      }
    }
    if (names.length === 0) {
      return;
    }
    const method = this.#requireMethodName(this.#config.methodNames.batchSet, "batch set properties");
    const encodedPromise = this.#encodeObject(snapshot);
    void encodedPromise.catch(() => undefined);
    return this.#scheduler.writeExplicit(async () => {
      const reference = await this.#ownedReference();
      const encoded = await encodedPromise;
      await this.#config.rpc.call<void>(this.#config.moduleId, method, [reference, encoded]);
    });
  }

  #defineMembers(): void {
    for (const [name, descriptor] of Object.entries(this.#config.properties)) {
      const propertyDescriptor: PropertyDescriptor = {
        enumerable: true,
        get: () => this.#getProperty(name)
      };
      if (descriptor.writable) {
        propertyDescriptor.set = (value: unknown) => this.#setProperty(name, value);
      }
      Object.defineProperty(this, name, propertyDescriptor);
    }

    for (const name of Object.keys(this.#config.methods)) {
      // A subclass may provide a callback-aware implementation for a descriptor-backed method.
      // Keep the descriptor as the public/result-kind source of truth, but do not shadow the
      // prototype implementation with RemoteClass's generic argument encoder.
      if (name in this) {
        continue;
      }
      Object.defineProperty(this, name, {
        enumerable: false,
        writable: false,
        value: (...args: unknown[]) => this.#callMethod(name, args)
      });
    }
  }

  #getProperty(name: string): unknown {
    const promise = this.#scheduler.run(async () => {
      const reference = await this.#ownedReference();
      const method = this.#requireMethodName(this.#config.methodNames.propertyGet[name], `get property ${name}`);
      const remoteKey = this.#config.properties[name]?.remoteKey;
      const callArgs = remoteKey === undefined ? [reference] : [reference, remoteKey];
      const raw = await this.#config.rpc.call<unknown>(this.#config.moduleId, method, callArgs);
      return this.#decodeProperty(name, raw);
    });
    return this.#wrapRemoteResult(promise, this.#config.properties[name], name);
  }

  #setProperty(name: string, value: unknown): void {
    this.#scheduler.enqueueWrite(() => this.#writeProperty(name, value));
  }

  #callMethod(name: string, args: readonly unknown[]): unknown {
    const promise = this.#scheduler.run(async () => {
      const reference = await this.#ownedReference();
      const method = this.#requireMethodName(this.#config.methodNames.method[name], `call method ${name}`);
      const encoded = await encodeRemoteArgs(args, this.#config.argEncoders);
      const raw = await this.#config.rpc.call<unknown>(this.#config.moduleId, method, [reference, ...encoded]);
      return this.#decodeResult(this.#config.methods[name], raw);
    });
    return this.#wrapRemoteResult(promise, this.#config.methods[name], name);
  }

  async #writeProperty(name: string, value: unknown): Promise<void> {
    const reference = await this.#ownedReference();
    const method = this.#requireMethodName(this.#config.methodNames.propertySet[name], `set property ${name}`);
    const remoteKey = this.#config.properties[name]?.remoteKey;
    const [encoded] = await encodeRemoteArgs([value], this.#config.argEncoders);
    const callArgs = remoteKey === undefined ? [reference, encoded] : [reference, remoteKey, encoded];
    await this.#config.rpc.call<void>(this.#config.moduleId, method, callArgs);
  }

  #wrapRemoteResult(
    promise: Promise<unknown>,
    descriptor: RemoteResultTyping | undefined,
    memberName: string
  ): unknown {
    if (
      descriptor?.refType === undefined &&
      descriptor?.refTypes === undefined &&
      descriptor?.remoteResult !== true
    ) {
      return promise;
    }
    return createRemoteResult(
      promise as Promise<object | null | undefined>,
      this.#scheduler,
      `${this.constructor.name}.${memberName}`
    );
  }

  async #ownedReference(): Promise<RemoteReference> {
    const reference = await this.#referencePromise;
    this.#config.rpc.assertReferenceActive?.(reference);
    return reference;
  }

  #decodeProperty(name: string, raw: unknown): unknown {
    return this.#decodeResult(this.#config.properties[name], raw);
  }

  /**
   * Decode a raw RPC result per a descriptor's result typing. Declarative names
   * (`refType`/`valueKind`/`collectionOf`) resolve through the injected decode context; a `decode`
   * closure is the fallback escape hatch. When neither applies the raw value passes through.
   */
  #decodeResult(descriptor: RemoteResultTyping & { decode?: RemoteValueDecoder } | undefined, raw: unknown): unknown {
    if (!descriptor) {
      return raw;
    }
    if (
      descriptor.refType !== undefined ||
      descriptor.refTypes !== undefined ||
      descriptor.valueKind !== undefined ||
      descriptor.collectionOf !== undefined
    ) {
      const context = this.#config.decodeContext;
      if (!context) {
        throw new Error("A declarative result typing was used without a decode context.");
      }
      if (descriptor.refType !== undefined) {
        return context.decodeRef(descriptor.refType, raw);
      }
      if (descriptor.refTypes !== undefined) {
        return context.decodeRefUnion(descriptor.refTypes, raw);
      }
      if (descriptor.valueKind !== undefined) {
        return context.decodeValue(descriptor.valueKind, raw);
      }
      return context.decodeCollection(descriptor.collectionOf as string, raw);
    }
    const decode = descriptor.decode;
    return decode ? (decode(raw) ?? raw) : raw;
  }

  #requireMethodName(method: string | undefined, action: string): string {
    if (method === undefined) {
      throw new Error(`No RPC method name configured to ${action}.`);
    }
    return method;
  }

  async #encodeObject(properties: Readonly<Record<string, unknown>>): Promise<Record<string, unknown>> {
    const entries = await Promise.all(
      Object.entries(properties).map(
        async ([key, value]) => [key, (await encodeRemoteArgs([value], this.#config.argEncoders))[0]] as const
      )
    );
    return Object.fromEntries(entries);
  }
}

const PROMISE_MEMBER_NAMES = ["then", "catch", "finally"] as const;

function assertNoPromiseLikeRemoteMembers(config: RemoteClassConfig): void {
  for (const name of PROMISE_MEMBER_NAMES) {
    if (
      Object.prototype.hasOwnProperty.call(config.properties, name) ||
      Object.prototype.hasOwnProperty.call(config.methods, name)
    ) {
      throw new TypeError(
        `Remote member ${name} is reserved because chainable remote results implement the Promise interface.`
      );
    }
  }
}

function assertBatchMethodsConfigured(config: RemoteClassConfig): void {
  const propertyNames = Object.keys(config.properties);
  if (propertyNames.length > 0 && config.methodNames.batchGet === undefined) {
    throw new TypeError(`Remote class ${config.moduleId} has readable properties but no batchGet RPC method.`);
  }
  if (
    propertyNames.some((name) => config.properties[name]?.writable) &&
    config.methodNames.batchSet === undefined
  ) {
    throw new TypeError(`Remote class ${config.moduleId} has writable properties but no batchSet RPC method.`);
  }
}

function normalizeBatchGetNames<K extends string>(
  propertyNames: readonly K[],
  descriptors: Readonly<Record<string, RemotePropertyDescriptor>>
): K[] {
  if (!Array.isArray(propertyNames)) {
    throw new TypeError("batchGet property names must be an array.");
  }
  const seen = new Set<string>();
  const result: K[] = [];
  for (const name of propertyNames) {
    if (typeof name !== "string") {
      throw new TypeError("batchGet property names must contain only strings.");
    }
    if (!Object.prototype.hasOwnProperty.call(descriptors, name)) {
      throw new TypeError(`Cannot batchGet unknown property: ${name}`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name as K);
    }
  }
  return result;
}

function snapshotBatchSetProperties(
  properties: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    throw new TypeError("batchSet properties must be a plain object.");
  }
  const prototype = Reflect.getPrototypeOf(properties);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("batchSet properties must be a plain object.");
  }
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const name of Object.keys(properties)) {
    snapshot[name] = properties[name];
  }
  return snapshot;
}

function isConstructionRequest(source: RemoteReference | RemoteConstructionRequest): source is RemoteConstructionRequest {
  return "method" in source && typeof (source).method === "string";
}
