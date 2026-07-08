import type { RemoteReference } from "@shared/uxp-api/remote-protocol.js";
import {
  encodeRemoteArgs,
  type RemoteArgEncoder,
  type RemoteReferenceHolder,
  type RemoteValueDecoder
} from "./reference.js";

/**
 * Minimal RPC surface a {@link RemoteClass} needs. Matches the WebView bridge rpc client.
 */
export interface RemoteRpc {
  call<T>(module: string, method: string, args?: readonly unknown[]): Promise<T>;
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
  readonly valueKind?: string;
  readonly collectionOf?: string;
}

/**
 * Resolver injected into a {@link RemoteClass} to decode declarative result typings. A module wires
 * this once (photoshop builds it from its type/value/collection registries); non-photoshop modules
 * (xmp) omit it and rely on the `decode` closure escape hatch instead.
 */
export interface RemoteDecodeContext {
  /** Decode a single remote reference envelope (or null) into a `===`-stable instance. */
  decodeRef(refType: string, raw: unknown): unknown;
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
export abstract class RemoteClass implements RemoteReferenceHolder {
  readonly #config: RemoteClassConfig;
  readonly #referencePromise: Promise<RemoteReference>;
  #queue: Promise<unknown> = Promise.resolve();

  protected constructor(config: RemoteClassConfig, source: RemoteReference | RemoteConstructionRequest) {
    this.#config = config;
    this.#referencePromise = isConstructionRequest(source)
      ? config.rpc.call<RemoteReference>(config.moduleId, source.method, source.args)
      : Promise.resolve(source);

    this.#defineMembers();
  }

  toRemoteReference(): Promise<RemoteReference> {
    return this.#referencePromise;
  }

  async dispose(): Promise<void> {
    const reference = await this.#referencePromise;
    await this.#config.rpc.call<void>(this.#config.moduleId, this.#config.methodNames.dispose, [reference]);
  }

  /** Read multiple properties of this object in a single RPC. */
  async batchGet<K extends string>(propertyNames: readonly K[]): Promise<Record<K, unknown>> {
    const method = this.#config.methodNames.batchGet;
    if (!method) {
      throw new Error("This remote class does not support batchGet.");
    }
    const reference = await this.#referencePromise;
    await this.#queue;
    const raw = await this.#config.rpc.call<Record<string, unknown>>(this.#config.moduleId, method, [
      reference,
      propertyNames
    ]);

    const result = {} as Record<K, unknown>;
    for (const name of propertyNames) {
      result[name] = this.#decodeProperty(name, raw[name]);
    }
    return result;
  }

  /** Set multiple writable properties of this object in a single queued RPC. */
  batchSet(properties: Readonly<Record<string, unknown>>): void {
    const method = this.#config.methodNames.batchSet;
    if (!method) {
      throw new Error("This remote class does not support batchSet.");
    }
    for (const name of Object.keys(properties)) {
      const descriptor = this.#config.properties[name];
      if (!descriptor || !descriptor.writable) {
        throw new Error(`Cannot batchSet non-writable property: ${name}`);
      }
    }
    this.#enqueueWrite(async (reference) => {
      const encoded = await this.#encodeObject(properties);
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
      Object.defineProperty(this, name, {
        enumerable: false,
        writable: false,
        value: (...args: unknown[]) => this.#callMethod(name, args)
      });
    }
  }

  async #getProperty(name: string): Promise<unknown> {
    const reference = await this.#referencePromise;
    await this.#queue;
    const method = this.#requireMethodName(this.#config.methodNames.propertyGet[name], `get property ${name}`);
    const remoteKey = this.#config.properties[name]?.remoteKey;
    const callArgs = remoteKey === undefined ? [reference] : [reference, remoteKey];
    const raw = await this.#config.rpc.call<unknown>(this.#config.moduleId, method, callArgs);
    return this.#decodeProperty(name, raw);
  }

  #setProperty(name: string, value: unknown): void {
    const method = this.#requireMethodName(this.#config.methodNames.propertySet[name], `set property ${name}`);
    const remoteKey = this.#config.properties[name]?.remoteKey;
    this.#enqueueWrite(async (reference) => {
      const [encoded] = await encodeRemoteArgs([value], this.#config.argEncoders);
      const callArgs = remoteKey === undefined ? [reference, encoded] : [reference, remoteKey, encoded];
      await this.#config.rpc.call<void>(this.#config.moduleId, method, callArgs);
    });
  }

  async #callMethod(name: string, args: readonly unknown[]): Promise<unknown> {
    const reference = await this.#referencePromise;
    await this.#queue;
    const method = this.#requireMethodName(this.#config.methodNames.method[name], `call method ${name}`);
    const encoded = await encodeRemoteArgs(args, this.#config.argEncoders);
    const raw = await this.#config.rpc.call<unknown>(this.#config.moduleId, method, [reference, ...encoded]);
    return this.#decodeResult(this.#config.methods[name], raw);
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
    if (descriptor.refType !== undefined || descriptor.valueKind !== undefined || descriptor.collectionOf !== undefined) {
      const context = this.#config.decodeContext;
      if (!context) {
        throw new Error("A declarative result typing was used without a decode context.");
      }
      if (descriptor.refType !== undefined) {
        return context.decodeRef(descriptor.refType, raw);
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

  #enqueueWrite(run: (reference: RemoteReference) => Promise<void>): void {
    this.#queue = this.#queue.then(async () => {
      const reference = await this.#referencePromise;
      await run(reference);
    });
    void this.#queue.catch(() => undefined);
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

function isConstructionRequest(source: RemoteReference | RemoteConstructionRequest): source is RemoteConstructionRequest {
  return "method" in source && typeof (source as RemoteConstructionRequest).method === "string";
}
