/**
 * `WebviewPsChannel` — the WebView remote proxy for a Photoshop `Channel`.
 *
 * The first new DOM class built entirely on the batch-0.5 registry foundation (RFC-0011): a class
 * factory over the shared namespace context, static descriptor tables as the runtime source of
 * truth, and `declare` members as the compile-time surface (locked together by RFC-0007's static
 * test). Scalar properties share the keyed `channel.propertyGet`/`channel.propertySet` RPC via
 * `remoteKey`; `color` decodes to / serializes from a `SolidColor` value object (ADR 0009); `parent`
 * decodes to the owning `Document` proxy; `histogram` is a raw scalar `number[]`. All methods here
 * mutate and are wrapped in executeAsModal host-side (ADR 0007).
 *
 * A channel has no stable native id, so the host mints a fresh handle per read (non-deduped): two
 * reads of the same channel yield distinct proxies with no `===` guarantee — unlike Document/Layer.
 */

import { PHOTOSHOP_MODULE_ID, PHOTOSHOP_REMOTE_TYPE } from "@shared/photoshop-api/photoshop-protocol.js";
import { SOLID_COLOR_VALUE_KIND } from "@shared/photoshop-api/value-objects.js";
import {
  RemoteClass,
  type RemoteClassConfig,
  type RemoteConstructionRequest,
  type RemoteMethodDescriptor,
  type RemoteMethodNames,
  type RemotePropertyDescriptor,
  type RemoteReference
} from "@webview/uxp-api/remote/index.js";
import type { ChannelTypeValue } from "@shared/photoshop-api/photoshop-constants.js";
import type { PhotoshopContext } from "./context.js";
import type { PsChannel, PsDocument, PsSolidColor } from "./types.js";

/** Read-only scalar Channel properties. `histogram` is a raw `number[]` (scalar). */
const CHANNEL_READONLY_SCALARS = ["histogram"] as const;

/** Read/write scalar Channel properties. */
const CHANNEL_WRITABLE_SCALARS = ["name", "opacity", "visible", "kind"] as const;

/**
 * Build the Channel property descriptor table. Exported (independently of the class factory) so the
 * registry static test can assert the declarative typings stay in sync with `PHOTOSHOP_RESULT_KINDS`
 * without constructing an instance. See {@link createLayerProperties}.
 */
export function createChannelProperties(): Record<string, RemotePropertyDescriptor> {
  const { Document } = PHOTOSHOP_REMOTE_TYPE;
  const properties: Record<string, RemotePropertyDescriptor> = {};
  for (const name of CHANNEL_READONLY_SCALARS) {
    properties[name] = { writable: false, mutating: false, remoteKey: name };
  }
  for (const name of CHANNEL_WRITABLE_SCALARS) {
    properties[name] = { writable: true, mutating: true, remoteKey: name };
  }
  properties.color = { writable: true, mutating: true, remoteKey: "color", valueKind: SOLID_COLOR_VALUE_KIND };
  properties.parent = { writable: false, mutating: false, remoteKey: "parent", refType: Document };
  return properties;
}

/** Build the Channel method descriptor table (see {@link createChannelProperties}). */
export function createChannelMethods(): Record<string, RemoteMethodDescriptor> {
  return {
    duplicate: { mutating: true },
    merge: { mutating: true },
    remove: { mutating: true }
  };
}

export function createChannelClass(context: PhotoshopContext): {
  new (reference: RemoteReference): PsChannel;
} {
  const { rpc, registry } = context;

  const properties = createChannelProperties();

  const methodNames: RemoteMethodNames = {
    propertyGet: Object.fromEntries(Object.keys(properties).map((name) => [name, "channel.propertyGet"])),
    propertySet: Object.fromEntries(
      [...CHANNEL_WRITABLE_SCALARS, "color"].map((name) => [name, "channel.propertySet"])
    ),
    method: {
      duplicate: "channel.duplicate",
      merge: "channel.merge",
      remove: "channel.remove"
    },
    batchGet: "channel.batchGet",
    batchSet: "channel.batchSet",
    dispose: "channel.dispose"
  };

  const methods = createChannelMethods();

  const config: RemoteClassConfig = {
    rpc,
    moduleId: PHOTOSHOP_MODULE_ID,
    methodNames,
    properties,
    methods,
    argEncoders: context.argEncoders,
    decodeContext: registry.decodeContext
  };

  class WebviewPsChannel extends RemoteClass implements PsChannel {
    declare name: Promise<string>;
    declare opacity: Promise<number>;
    declare visible: Promise<boolean>;
    declare kind: Promise<ChannelTypeValue>;
    declare readonly histogram: Promise<readonly number[]>;
    declare color: Promise<PsSolidColor>;
    declare readonly parent: PsChannel["parent"];

    declare duplicate: (targetDocument?: PsDocument) => Promise<void>;
    declare merge: () => Promise<void>;
    declare remove: () => Promise<void>;

    constructor(source: RemoteReference | RemoteConstructionRequest) {
      super(config, source);
    }
  }

  return WebviewPsChannel as unknown as { new (reference: RemoteReference): PsChannel };
}
