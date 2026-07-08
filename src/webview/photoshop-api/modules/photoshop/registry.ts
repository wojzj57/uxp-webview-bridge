/**
 * The photoshop WebView type/value/collection registry (ADR 0009).
 *
 * Replaces the four hand-wired decoder closures (`documentDecoder`/`layerDecoder`/`layersDecoder`/
 * `boundsDecoder`) that `context.ts` used to thread through every class factory. Instead:
 *
 * - a **type registry** maps a remote type name (`"Document"`, `"Layer"`, ...) to its
 *   `RemoteClass` factory plus a per-type WeakRef identity cache, so decoding a reference envelope
 *   always yields a `===`-stable instance (ADR 0005);
 * - the **value-object registry** lives in shared code (`value-objects.ts`);
 * - a **snapshot-collection factory** ({@link createSnapshotCollection}) generalizes the former
 *   `Layers` wrapper for any member kind.
 *
 * The resolver is looked up **lazily at decode time**, so a class that references a type registered
 * later (Document↔Layer cycle, and the dense cyclic graph at full coverage) is fine: the factory is
 * present by the time any property is actually awaited. This is the construction-order fix ADR 0009
 * mandates. All of it is built once in `photoshop.ts` and injected as a {@link RemoteDecodeContext}.
 */

import {
  decodeValue as decodeSharedValue,
  isPhotoshopValueTransport
} from "@shared/photoshop-api/value-objects.js";
import {
  isPhotoshopSnapshotTransport,
  PHOTOSHOP_MODULE_ID
} from "@shared/photoshop-api/photoshop-protocol.js";
import { REMOTE_REFERENCE_KIND } from "@shared/uxp-api/remote-protocol.js";
import {
  createIdentityCache,
  isRemoteReference,
  type IdentityCache,
  type RemoteDecodeContext,
  type RemoteReference,
  type RemoteRpc
} from "@webview/uxp-api/remote/index.js";

/** Factory that builds a remote proxy instance from its reference envelope. */
export type RemoteInstanceFactory = (reference: RemoteReference) => object;

interface TypeRegistration {
  readonly factory: RemoteInstanceFactory;
  readonly identityCache: IdentityCache<object>;
}

/**
 * Optional RPC-backed capabilities a snapshot collection may expose. Each is declared per collection
 * (never assumed): `getByName` resolves a single member by name; `add` creates/adds a member. Both
 * carry the owner reference to the host.
 */
export interface SnapshotCollectionCapabilities {
  readonly getByName?: string;
  readonly add?: string;
}

/**
 * The photoshop type registry: name -> { factory, identity cache }, plus the decode resolver and the
 * snapshot-collection factory that both depend on it. Construct it empty, register each class as it
 * is built, then hand `decodeContext` to every class config.
 */
export interface PhotoshopTypeRegistry {
  /** Register a remote type's factory. Throws on a duplicate name. */
  register(typeName: string, factory: RemoteInstanceFactory): void;
  /**
   * Declare the collection capabilities for a member kind, so every snapshot collection of that
   * member kind (from any property/method) exposes the same RPC-backed operations. Declared once per
   * member kind alongside the class registration.
   */
  registerCollectionCapabilities(memberKind: string, capabilities: SnapshotCollectionCapabilities): void;
  /** Resolve (create-or-reuse) an instance from a reference envelope through the type's cache. */
  resolveReference(reference: RemoteReference): object;
  /** The decode resolver injected into every RemoteClass config. */
  readonly decodeContext: RemoteDecodeContext;
}

export function createPhotoshopTypeRegistry(rpc: RemoteRpc): PhotoshopTypeRegistry {
  const types = new Map<string, TypeRegistration>();
  const collectionCapabilities = new Map<string, SnapshotCollectionCapabilities>();

  function register(typeName: string, factory: RemoteInstanceFactory): void {
    if (types.has(typeName)) {
      throw new Error(`Duplicate photoshop remote type registration: ${typeName}`);
    }
    types.set(typeName, { factory, identityCache: createIdentityCache<object>() });
  }

  function registerCollectionCapabilities(memberKind: string, capabilities: SnapshotCollectionCapabilities): void {
    collectionCapabilities.set(memberKind, capabilities);
  }

  function registration(typeName: string): TypeRegistration {
    const entry = types.get(typeName);
    if (!entry) {
      throw new Error(`Unregistered photoshop remote type: ${typeName}`);
    }
    return entry;
  }

  function resolveReference(reference: RemoteReference): object {
    const entry = registration(reference.type);
    return entry.identityCache.getOrCreate(reference.id, () => entry.factory(reference));
  }

  const decodeContext: RemoteDecodeContext = {
    decodeRef(refType, raw) {
      if (raw == null) {
        return null;
      }
      if (!isRemoteReference(raw) || raw.type !== refType) {
        throw new Error(`Expected a ${refType} reference envelope.`);
      }
      return resolveReference(raw);
    },
    decodeValue(valueKind, raw) {
      if (!isPhotoshopValueTransport(raw) || raw.valueKind !== valueKind) {
        throw new Error(`Expected a ${valueKind} value envelope.`);
      }
      return decodeSharedValue(raw);
    },
    decodeCollection(memberKind, raw) {
      if (!isPhotoshopSnapshotTransport(raw) || raw.memberKind !== memberKind) {
        throw new Error(`Expected a ${memberKind} snapshot envelope.`);
      }
      return createSnapshotCollection(memberKind, raw.owner, raw.memberIds);
    }
  };

  function memberReference(memberKind: string, id: string): RemoteReference {
    return { kind: REMOTE_REFERENCE_KIND, type: memberKind, id };
  }

  function createSnapshotCollection(
    memberKind: string,
    owner: RemoteReference,
    memberIds: readonly string[]
  ): unknown[] {
    const capabilities = collectionCapabilities.get(memberKind) ?? {};
    const resolved = memberIds.map((id) => resolveReference(memberReference(memberKind, id)));

    class SnapshotCollection extends Array<object> {
      async getByName(name: string): Promise<object | null> {
        const method = capabilities.getByName;
        if (!method) {
          throw new Error(`This ${memberKind} collection does not support getByName.`);
        }
        const raw = await rpc.call<unknown>(PHOTOSHOP_MODULE_ID, method, [owner, name]);
        return raw == null ? null : (decodeContext.decodeRef(memberKind, raw) as object);
      }

      async add(options?: unknown): Promise<object> {
        const method = capabilities.add;
        if (!method) {
          throw new Error(`This ${memberKind} collection does not support add.`);
        }
        const raw = await rpc.call<unknown>(PHOTOSHOP_MODULE_ID, method, [owner, options]);
        const decoded = decodeContext.decodeRef(memberKind, raw);
        if (decoded == null) {
          throw new Error(`${method} did not return a ${memberKind} reference.`);
        }
        return decoded as object;
      }
    }

    // `Array`'s constructor treats a single numeric argument as a length; build via `from`.
    return SnapshotCollection.from(resolved) as SnapshotCollection;
  }

  return { register, registerCollectionCapabilities, resolveReference, decodeContext };
}
