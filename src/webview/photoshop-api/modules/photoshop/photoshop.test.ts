/**
 * Photoshop module tests (RFC-0007).
 *
 * This file carries two independent test layers that share one location:
 *
 * 1. **Static consistency (compile-time only).** Module-scope `type`-level assertions that run under
 *    `pnpm typecheck` and the CDP webview tsc project. They emit no runtime code (all relative
 *    imports are `type`-only, as the static boundary checker requires for WebView CDP test files):
 *      - the transcribed `as const` constant unions stay compatible with Adobe's real DOM enums;
 *      - `batchSet` rejects read-only properties at compile time;
 *      - the `declare` member key sets of `PsDocument`/`PsLayer` match the descriptor-table key sets
 *        that back them (the double-write guard the spec mandates for ADR 0002).
 *    The *runtime* half of the descriptor<->declare lock lives in
 *    `test/contract/photoshop-remote-consistency.test.mjs` (it needs the built classes).
 *
 * 2. **Co-located CDP cases (real Photoshop via `test:uxp`).** The eight `photoshop.`-prefixed cases
 *    below exercise the live bridge, following the `fs.test.ts`/`uxp.test.ts` conventions
 *    (`bridge.ensureConfigured()`, `assert`, `skip`, best-effort cleanup). They only ever touch
 *    `ctx.bridge`; the Adobe host owns all real Photoshop work.
 */

import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

// --- Static layer: type-only imports (erased at runtime; allowed by the static boundary checker) ---
import type {
  AnchorPosition as AdobeAnchorPosition,
  BlendMode as AdobeBlendMode,
  ChannelType as AdobeChannelType,
  ElementPlacement as AdobeElementPlacement,
  FlipAxis as AdobeFlipAxis,
  LayerKind as AdobeLayerKind,
  SaveOptions as AdobeSaveOptions
} from "@shared/types/photoshop/internal/dom/Constants.js";
import type * as AdobeConstants from "@shared/types/photoshop/internal/dom/Constants.js";
import type {
  AnchorPositionValue,
  BlendModeValue,
  ChannelTypeValue,
  ElementPlacementValue,
  FlipAxisValue,
  LayerKindValue,
  PhotoshopConstantsNamespace,
  SaveOptionsValue
} from "@shared/photoshop-api/photoshop-constants.js";
import type {
  ActionDescriptor as AdobeActionDescriptor,
  ActionReference as AdobeActionReference,
  BatchPlayCommandOptions as AdobeBatchPlayCommandOptions
} from "@shared/types/photoshop/internal/dom/CoreModules.js";
import type {
  ActionDescriptor,
  ActionReference,
  BatchPlayCommandOptions,
  PsChannel,
  PsChannelReadableKey,
  PsChannelWritableProps,
  PsDocument,
  PsDocumentReadableKey,
  PsDocumentWritableProps,
  PsLayer,
  PsLayerReadableKey,
  PsLayerWritableProps,
  PhotoshopNamespace
} from "./types.js";

// ---------------------------------------------------------------------------------------------------
// Static consistency assertions (compile-time only)
// ---------------------------------------------------------------------------------------------------

/** Compiles only when `A` and `B` are mutually assignable (i.e. the same set of values). */
type AssertMutual<A extends B, B extends C, C = A> = true;

/**
 * Constant compatibility (ADR 0006 / RFC-0004).
 *
 * Strategy (RFC-0007 option "a"): the real Adobe enums are declared as `export enum` in
 * `src/shared/types/photoshop/internal/dom/Constants.d.ts`. The dedicated `@shared-types/photoshop/*`
 * alias is broken (it points at a non-existent `.../src/*` bucket), so instead of touching that
 * alias we reach the enum *types* through the working `@shared/*` alias with a `type`-only import.
 * `<Enum>[keyof <Enum>]` is the union of the enum's member *values*; each transcribed `...Value`
 * union must be mutually assignable to it. A drift in any hand-copied value fails to compile here.
 */
type _AnchorCompatible = AssertMutual<AnchorPositionValue, `${AdobeAnchorPosition}`>;
type _BlendModeCompatible = AssertMutual<BlendModeValue, `${AdobeBlendMode}`>;
type _LayerKindCompatible = AssertMutual<LayerKindValue, `${AdobeLayerKind}`>;
type _ElementPlacementCompatible = AssertMutual<ElementPlacementValue, `${AdobeElementPlacement}`>;
type _FlipAxisCompatible = AssertMutual<FlipAxisValue, `${AdobeFlipAxis}`>;
type _ChannelTypeCompatible = AssertMutual<ChannelTypeValue, `${AdobeChannelType}`>;

// SaveOptions is a numeric enum; its value union is numeric, so compare against the numeric enum
// value union directly rather than a template-literal (which only applies to string enums).
type _SaveOptionsExact = AssertMutual<SaveOptionsValue, AdobeSaveOptions>;

/** Every Adobe enum name is generated and carried by the public Photoshop namespace type. */
type AssertNever<T extends never> = true;
type _AllAdobeConstantNamesGenerated = AssertNever<
  Exclude<keyof typeof AdobeConstants, "constants" | keyof PhotoshopConstantsNamespace>
>;
type _NoGeneratedConstantNamesOutsideAdobe = AssertNever<
  Exclude<keyof PhotoshopConstantsNamespace, Exclude<keyof typeof AdobeConstants, "constants">>
>;
type _AllGeneratedConstantsPublic = AssertNever<
  Exclude<keyof PhotoshopConstantsNamespace, keyof PhotoshopNamespace>
>;

/**
 * `batchSet` writability: passing a read-only property must be a compile-time error. `PsDocument.id`
 * and `PsLayer.id` are read-only, so the following are expected to fail to type-check.
 */
type _DocWritableIsExactlyWritable = AssertMutual<keyof PsDocumentWritableProps, "pixelAspectRatio">;
type _LayerWritableExcludesReadonly = "id" extends keyof PsLayerWritableProps ? never : true;
const _layerWritableExcludesReadonly: _LayerWritableExcludesReadonly = true;
void _layerWritableExcludesReadonly;

/**
 * Descriptor <-> declare lock (type-level half).
 *
 * The runtime descriptor tables are keyed by the same names as the interface members; here we assert
 * that the *readable* key unions (which the descriptor tables enumerate) exactly match the readable
 * members declared on the interfaces. The runtime half in the contract test proves the tables agree
 * with these keys at runtime. Together they catch either side drifting.
 */
type PsDocumentReadableMembers = Exclude<
  keyof PsDocument,
  "duplicate" | "close" | "closeWithoutSaving" | "flatten" | "mergeVisibleLayers" | "revealAll" |
  "rasterizeAllLayers" | "crop" | "resizeCanvas" | "resizeImage" | "trim" | "rotate" | "save" |
  "createLayer" | "createPixelLayer" | "createTextLayer" | "createLayerGroup" | "groupLayers" |
  "duplicateLayers" | "linkLayers" | "paste" | "batchGet" | "batchSet" | "dispose" |
  "layers" | "activeLayers" | "artboards" | "backgroundLayer" |
  "channels" | "componentChannels" | "activeChannels"
>;
type _DocReadableKeysLocked = AssertMutual<PsDocumentReadableMembers, PsDocumentReadableKey>;

type PsLayerReadableMembers = Exclude<
  keyof PsLayer,
  "delete" | "duplicate" | "link" | "unlink" | "move" | "translate" | "flip" | "scale" | "rotate" |
  "merge" | "rasterize" | "batchGet" | "batchSet" | "dispose" |
  "document" | "parent" | "linkedLayers"
>;
type _LayerReadableKeysLocked = AssertMutual<PsLayerReadableMembers, PsLayerReadableKey>;

type PsChannelReadableMembers = Exclude<
  keyof PsChannel,
  "duplicate" | "merge" | "remove" | "batchGet" | "batchSet" | "dispose" | "parent"
>;
type _ChannelReadableKeysLocked = AssertMutual<PsChannelReadableMembers, PsChannelReadableKey>;

// `color` is the sole non-scalar writable; assert the writable key set matches the declared props.
type _ChannelWritableIsExactlyWritable = AssertMutual<
  keyof PsChannelWritableProps,
  "name" | "opacity" | "visible" | "kind" | "color"
>;

/**
 * batchPlay descriptor/option compatibility (ADR 0010 / RFC-0009).
 *
 * `photoshop.action.batchPlay` transports descriptors verbatim to Adobe's real `batchPlay`, so our
 * locally-declared shapes must stay assignable to Adobe's `ActionDescriptor` / `BatchPlayCommandOptions`
 * (reached through the working `@shared/*` alias, since the `@shared-types/photoshop/*` alias is
 * broken — same strategy as the enum checks above). If a field drifts so our value would no longer
 * satisfy Adobe's API, these fail to compile. `ActionDescriptor` is checked both ways because a
 * host result descriptor we return must also be usable as an input descriptor.
 */
type Assignable<From, To> = [From] extends [To] ? true : never;
type _DescriptorToAdobe = Assignable<ActionDescriptor, AdobeActionDescriptor>;
type _DescriptorFromAdobe = Assignable<AdobeActionDescriptor, ActionDescriptor>;
type _ReferenceToAdobe = Assignable<ActionReference, AdobeActionReference>;
type _ReferenceFromAdobe = Assignable<AdobeActionReference, ActionReference>;
type _OptionsToAdobe = Assignable<BatchPlayCommandOptions, AdobeBatchPlayCommandOptions>;

// Reference the compile-time-only aliases so `noUnusedLocals`-style tools (should they ever be
// enabled) do not strip them; `type` aliases are erased regardless.
export type _StaticConsistencyProof = [
  _SaveOptionsExact,
  _AnchorCompatible,
  _BlendModeCompatible,
  _LayerKindCompatible,
  _ElementPlacementCompatible,
  _FlipAxisCompatible,
  _ChannelTypeCompatible,
  _AllAdobeConstantNamesGenerated,
  _NoGeneratedConstantNamesOutsideAdobe,
  _AllGeneratedConstantsPublic,
  _DocWritableIsExactlyWritable,
  _DocReadableKeysLocked,
  _LayerReadableKeysLocked,
  _ChannelReadableKeysLocked,
  _ChannelWritableIsExactlyWritable,
  _DescriptorToAdobe,
  _DescriptorFromAdobe,
  _ReferenceToAdobe,
  _ReferenceFromAdobe,
  _OptionsToAdobe
];

// ---------------------------------------------------------------------------------------------------
// CDP cases (real Photoshop host)
// ---------------------------------------------------------------------------------------------------

const SIX_BOUNDS_FIELDS = ["left", "right", "top", "bottom", "width", "height"] as const;

export default defineWebviewCdpCases([
  {
    name: "photoshop.public-shape",
    run({ bridge, assert, hostDiagnostics, reportDiagnostics }) {
      const photoshop = bridge.photoshop;
      assert.ok(typeof photoshop === "object" && photoshop !== null, "bridge.photoshop must be an object.");
      assert.ok(typeof photoshop.app === "object" && photoshop.app !== null, "photoshop.app must be an object.");
      assert.functions(photoshop.app, ["open"], "photoshop.app");
      assert.ok("activeDocument" in photoshop.app, "photoshop.app.activeDocument must exist.");
      assert.ok("documents" in photoshop.app, "photoshop.app.documents must exist.");

      assert.ok(typeof photoshop.action === "object" && photoshop.action !== null, "photoshop.action must be an object.");
      assert.functions(
        photoshop.action,
        ["batchPlay", "batchPlaySync", "getIDFromString", "recordAction", "validateReference"],
        "photoshop.action"
      );

      const constantEntries = Object.entries(photoshop).filter(
        ([name]) => !["app", "action", "core", "imaging", "constants"].includes(name)
      );
      assert.equal(
        constantEntries.length,
        103,
        "photoshop must synchronously expose 102 Constants.d.ts enums plus ColorConversionModel."
      );
      for (const [name, table] of constantEntries) {
        assert.ok(typeof table === "object" && table !== null, `photoshop.${name} must be an object.`);
        assert.equal(
          typeof (table as { then?: unknown }).then,
          "undefined",
          `photoshop.${name} must not be Promise-like.`
        );
      }
      assert.equal(Object.keys(photoshop.constants).length, 102, "photoshop.constants must contain every declared enum.");
      assert.equal(photoshop.constants.LayerKind, photoshop.LayerKind, "aggregate and direct tables must share identity.");
      assert.equal(photoshop.InterpolationMethod.AUTOMATIC, "bicubicAutomatic", "InterpolationMethod should be present.");
      assert.equal(photoshop.LayerKind.NORMAL, "pixel", "LayerKind.NORMAL should transcribe to 'pixel'.");
      assert.equal(photoshop.BlendMode.SUBTRACT, "blendSubtraction", "BlendMode.SUBTRACT should transcribe correctly.");
      assert.equal(photoshop.SaveOptions.DONOTSAVECHANGES, 0, "SaveOptions.DONOTSAVECHANGES should be 0.");
      assert.equal(photoshop.GridSize.DOTTED, undefined, "GridSize must not acquire GridLineStyle members.");
      assert.equal(photoshop.GenerativeUpscaleModel.FIREFLY, "firefly", "the final declaration enum should be present.");

      const diagnostics = hostDiagnostics as {
        __UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS__?: Record<string, Record<string, string | number>>;
        __UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS_ERROR__?: string;
      };
      assert.equal(
        diagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS_ERROR__,
        undefined,
        "the UXP fixture must be able to snapshot native Photoshop constants."
      );
      const nativeConstants = diagnostics.__UXP_BRIDGE_TEST_PHOTOSHOP_CONSTANTS__;
      assert.ok(nativeConstants && typeof nativeConstants === "object", "native Photoshop constants snapshot must exist.");
      let nativeMembersChecked = 0;
      for (const [enumName, nativeEnum] of Object.entries(nativeConstants ?? {})) {
        const webviewEnum = photoshop.constants[enumName];
        assert.ok(webviewEnum && typeof webviewEnum === "object", `native enum ${enumName} must exist in WebView constants.`);
        for (const [memberName, nativeValue] of Object.entries(nativeEnum)) {
          assert.equal(
            webviewEnum[memberName],
            nativeValue,
            `photoshop.constants.${enumName}.${memberName} must match the native UXP runtime.`
          );
          nativeMembersChecked += 1;
        }
      }
      reportDiagnostics({
        nativePhotoshopEnumsChecked: Object.keys(nativeConstants ?? {}).length,
        nativePhotoshopMembersChecked: nativeMembersChecked
      });

      return {
        declaredEnumsChecked: Object.keys(photoshop.constants).length,
        publicConstantTypesChecked: constantEntries.length,
        nativeEnumsChecked: Object.keys(nativeConstants ?? {}).length,
        nativeMembersChecked
      };
    }
  },
  {
    name: "photoshop.document-read",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const [id, name, width, height] = await Promise.all([
        document.id,
        document.name,
        document.width,
        document.height
      ]);

      assert.ok(typeof id === "number", "document.id should resolve to a number.");
      assert.nonEmptyString(name, "document.name");
      assert.ok(typeof width === "number" && width > 0, "document.width should be a positive number.");
      assert.ok(typeof height === "number" && height > 0, "document.height should be a positive number.");

      return { id, name, width, height };
    }
  },
  {
    name: "photoshop.layer-read-write",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const originalName = await layer.name;
      assert.ok(typeof originalName === "string", "layer.name should resolve to a string.");

      const originalOpacity = await layer.opacity;
      assert.ok(typeof originalOpacity === "number", "layer.opacity should resolve to a number.");

      const target = originalOpacity >= 50 ? 25 : 75;
      // The getter is typed `Promise<number>`, but the fire-and-forget setter forwards the raw value
      // to the host (ADR 0003 / RFC-0005): assign a plain number, not a Promise. The cast bridges the
      // getter-shaped property type to the setter's real (raw-value) expectation.
      layer.opacity = target as unknown as Promise<number>;
      // Fire-and-forget setter with read-your-writes: a subsequent read must reflect the new value.
      const updated = await layer.opacity;
      assert.equal(Math.round(updated), target, "layer.opacity read-your-writes should reflect the queued set.");

      // Restore.
      layer.opacity = originalOpacity as unknown as Promise<number>;
      await layer.opacity;

      return { originalName, originalOpacity, updated };
    }
  },
  {
    name: "photoshop.layer-bounds-value",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const bounds = await layer.bounds;
      assert.ok(typeof bounds === "object" && bounds !== null, "layer.bounds should be a plain object.");
      for (const field of SIX_BOUNDS_FIELDS) {
        assert.ok(typeof bounds[field] === "number", `layer.bounds.${field} should be a number.`);
      }
      // A value object carries no remote methods.
      assert.equal(typeof (bounds as { dispose?: unknown }).dispose, "undefined", "bounds should have no dispose().");
      assert.equal(typeof (bounds as { toRemoteReference?: unknown }).toRemoteReference, "undefined", "bounds has no reference.");

      return { bounds };
    }
  },
  {
    name: "photoshop.layers-collection",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const layers = await document.layers;
      assert.ok(typeof layers.length === "number", "layers.length should be a number.");
      assert.ok(layers.length >= 1, "an open document should have at least one layer.");

      const first = layers[0];
      if (!first) {
        return skip("the active document reported no layers.");
      }

      // Element identity is stable across index/iteration.
      let iteratedFirst: unknown;
      for (const entry of layers) {
        iteratedFirst = entry;
        break;
      }
      assert.equal(iteratedFirst, first, "iteration should yield the same === layer instance as indexing.");

      // Container identity is NOT stable: re-reading the property yields a fresh collection wrapper.
      const layersAgain = await document.layers;
      assert.ok(layersAgain !== layers, "re-reading document.layers should yield a new collection wrapper.");
      // ...but the elements it resolves are the same === instances.
      assert.equal(layersAgain[0], first, "elements across collection snapshots should be === stable.");

      const byName = await layers.getByName(await first.name);
      assert.ok(byName === null || typeof byName === "object", "getByName should return a layer or null.");

      return { length: layers.length };
    }
  },
  {
    name: "photoshop.identity-dedup",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const first = await getActiveDocument(bridge, skip);
      if (isSkip(first)) {
        return first;
      }
      const second = await bridge.photoshop.app.activeDocument;

      assert.equal(second, first, "resolving the same document id twice should yield === instances.");

      const layersA = await first.layers;
      const layerA = layersA[0];
      if (layerA) {
        const layerB = (await second.layers)[0];
        assert.equal(layerB, layerA, "the same layer id should resolve to === layer instances.");
      }

      return { deduped: true };
    }
  },
  {
    name: "photoshop.layer-mutating",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      let created: PsLayer | undefined;
      let duplicated: PsLayer | undefined;
      try {
        created = await document.createLayer({ name: `uxp-bridge-cdp-${Date.now()}` });
        assert.ok(typeof created === "object" && created !== null, "createLayer should return a layer proxy.");
        const createdId = await created.id;
        assert.ok(typeof createdId === "number", "created layer should expose a numeric id.");

        duplicated = await created.duplicate();
        assert.ok(typeof duplicated === "object" && duplicated !== null, "duplicate should return a layer proxy.");
        const duplicatedId = await duplicated.id;
        assert.ok(duplicatedId !== createdId, "duplicate should produce a distinct layer id.");

        return { createdId, duplicatedId };
      } finally {
        await deleteQuietly(duplicated);
        await deleteQuietly(created);
      }
    }
  },
  {
    name: "photoshop.batch-get-set",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      const batch = await layer.batchGet(["id", "name", "opacity", "visible"]);
      assert.ok(typeof batch.id === "number", "batchGet should read id.");
      assert.ok(typeof batch.name === "string", "batchGet should read name.");
      assert.ok(typeof batch.opacity === "number", "batchGet should read opacity.");
      assert.ok(typeof batch.visible === "boolean", "batchGet should read visible.");

      const original = batch.opacity as number;
      const target = original >= 50 ? 30 : 80;
      layer.batchSet({ opacity: target, visible: true });
      const afterOpacity = await layer.opacity;
      assert.equal(Math.round(afterOpacity), target, "batchSet then read-your-writes should reflect the batch.");

      // Read-only property rejected at compile time (writable-only partial) AND at runtime
      // (base `batchSet` throws for non-writable keys). The `@ts-expect-error` proves the compile-time
      // guard; the try/catch proves the runtime guard without failing the case on the expected throw.
      let readOnlyRejected = false;
      try {
        // @ts-expect-error `id` is read-only and must not be assignable through batchSet.
        layer.batchSet({ id: 1 });
      } catch {
        readOnlyRejected = true;
      }
      assert.ok(readOnlyRejected, "batchSet of a read-only property should throw at runtime.");

      // Restore.
      layer.batchSet({ opacity: original });
      await layer.opacity;

      return { batchKeys: 4, target };
    }
  },
  {
    name: "photoshop.channels-collection",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }

      const channels = await document.channels;
      assert.ok(typeof channels.length === "number", "channels.length should be a number.");
      assert.ok(channels.length >= 1, "an open document should expose at least one channel.");

      const first = channels[0];
      if (!first) {
        return skip("the active document reported no channels.");
      }

      // Re-reading the collection yields a fresh wrapper. Unlike layers, channel *members* are NOT
      // ===-deduped (no stable native id → non-deduped RemoteObject), so we assert only the wrapper
      // is distinct and that name-based lookup resolves a channel or null.
      const channelsAgain = await document.channels;
      assert.ok(channelsAgain !== channels, "re-reading document.channels should yield a new wrapper.");

      const componentChannels = await document.componentChannels;
      assert.ok(typeof componentChannels.length === "number", "componentChannels.length should be a number.");

      const byName = await channels.getByName(await first.name);
      assert.ok(byName === null || typeof byName === "object", "channels.getByName should return a channel or null.");

      return { length: channels.length, componentLength: componentChannels.length };
    }
  },
  {
    name: "photoshop.channel-read-write",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channel = await (await document.channels).add();
      try {
        const [name, visible, kind] = await Promise.all([channel.name, channel.visible, channel.kind]);
        assert.nonEmptyString(name, "channel.name");
        assert.ok(typeof visible === "boolean", "channel.visible should resolve to a boolean.");
        assert.nonEmptyString(kind, "channel.kind");

        const originalOpacity = await channel.opacity;
        assert.ok(typeof originalOpacity === "number", "channel.opacity should resolve to a number.");

        const target = originalOpacity >= 50 ? 40 : 60;
        channel.opacity = target as unknown as Promise<number>;
        const updated = await channel.opacity;
        assert.equal(Math.round(updated), target, "channel.opacity read-your-writes should reflect the queued set.");

        return { name, visible, kind, originalOpacity, updated };
      } finally {
        await channel.remove();
      }
    }
  },
  {
    name: "photoshop.channel-color-solidcolor",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channel = await (await document.channels).add();
      try {
        const color = await channel.color;
        assert.ok(typeof color === "object" && color !== null, "channel.color should be a plain object.");
        for (const model of ["rgb", "hsb", "cmyk", "lab", "gray"] as const) {
          assert.ok(typeof color[model] === "object" && color[model] !== null, `channel.color.${model} should be present.`);
        }
        assert.nonEmptyString(color.typename, "channel.color.typename");
        // A value object carries no remote methods.
        assert.equal(typeof (color as { dispose?: unknown }).dispose, "undefined", "color should have no dispose().");

        channel.color = { rgb: { red: 12, green: 34, blue: 56 } } as unknown as Promise<typeof color>;
        const afterWrite = await channel.color;
        assert.ok(typeof afterWrite === "object" && afterWrite !== null, "channel.color read-back should be an object.");
        assert.ok(typeof afterWrite.rgb.red === "number", "channel.color.rgb.red should be a number after write.");

        channel.visible = true as unknown as Promise<boolean>;
        await channel.visible;
        const histogram = await channel.histogram;
        assert.ok(Array.isArray(histogram), "channel.histogram should be an array.");

        return { typename: color.typename, histogramLength: histogram.length };
      } finally {
        await channel.remove();
      }
    }
  },
  {
    name: "photoshop.channel-parent-document-identity",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const channels = await document.channels;
      const channel = channels[0];
      if (!channel) {
        return skip("the active document reported no channels.");
      }

      // The channel's parent must resolve to the SAME === document instance (Document IS deduped by
      // native id — only channels themselves are non-deduped). This is the identity guarantee we keep.
      const parent = await channel.parent;
      assert.equal(parent, document, "channel.parent should resolve to the === owning document instance.");

      return { parentIsOwner: true };
    }
  },
  {
    name: "photoshop.batchplay-roundtrip",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const layer = await getActiveLayer(bridge, skip);
      if (isSkip(layer)) {
        return layer;
      }

      // Read-style descriptor: get the target layer property set. batchPlay returns a descriptor array.
      const [layerDescriptor] = await bridge.photoshop.action.batchPlay([
        { _obj: "get", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }
      ]);
      assert.ok(typeof layerDescriptor === "object" && layerDescriptor !== null, "batchPlay read should return a descriptor.");
      const nativeLayerId = layerDescriptor.layerID as number;
      assert.ok(typeof nativeLayerId === "number", "the read descriptor should carry a native layerID.");

      // The bridge proxy id must agree with the native id batchPlay reports (proves the disjoint id
      // spaces still refer to the same layer — the "caller supplies native id" workflow).
      const proxyId = await layer.id;
      assert.equal(nativeLayerId, proxyId, "batchPlay's native layerID should match the proxy layer id.");

      // Write-style descriptor: flip visibility of that layer by its native id, then restore it. This
      // proves a caller can target a specific layer with a native id obtained from the DOM proxy.
      const originalVisible = await layer.visible;
      const setVisible = (visible: boolean) =>
        bridge.photoshop.action.batchPlay([
          {
            _obj: visible ? "show" : "hide",
            _target: [{ _ref: "layer", _id: nativeLayerId }]
          }
        ]);

      const writeResult = await setVisible(!originalVisible);
      assert.ok(Array.isArray(writeResult), "batchPlay write should return a descriptor array.");
      const afterWrite = await layer.visible;
      assert.equal(afterWrite, !originalVisible, "batchPlay set should have flipped the layer visibility.");

      // Restore.
      await setVisible(originalVisible);
      const restored = await layer.visible;
      assert.equal(restored, originalVisible, "batchPlay should have restored the original visibility.");

      return { nativeLayerId, proxyId, roundTripped: true };
    }
  },
  {
    name: "photoshop.action-utilities",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();

      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const documentId = await document.id;
      const reference = [{ _ref: "document", _id: documentId }];

      const [descriptor] = await bridge.photoshop.action.batchPlaySync([
        { _obj: "get", _target: reference }
      ]);
      assert.ok(typeof descriptor === "object" && descriptor !== null, "batchPlaySync should return a descriptor.");
      assert.equal(descriptor.documentID, documentId, "batchPlaySync should read the active native document id.");

      const firstId = await bridge.photoshop.action.getIDFromString("document");
      const secondId = await bridge.photoshop.action.getIDFromString("document");
      assert.ok(typeof firstId === "number" && Number.isFinite(firstId), "getIDFromString should return a finite number.");
      assert.equal(secondId, firstId, "getIDFromString should return a stable id for the same string.");

      const valid = await bridge.photoshop.action.validateReference(reference);
      assert.equal(valid, true, "validateReference should accept the active document reference.");

      return { documentId, actionStringId: firstId, valid };
    }
  }
]);

// ---------------------------------------------------------------------------------------------------
// CDP helpers
// ---------------------------------------------------------------------------------------------------

interface SkipMarker {
  readonly __skip: true;
}

function isSkip(value: unknown): value is SkipMarker {
  return typeof value === "object" && value !== null && (value as SkipMarker).__skip === true;
}

async function getActiveDocument(
  bridge: { photoshop: any },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown
): Promise<PsDocument | SkipMarker> {
  try {
    const document = await bridge.photoshop.app.activeDocument;
    if (!document) {
      return markSkip(skip("photoshop.app.activeDocument is unavailable (no open document)."));
    }
    return document as PsDocument;
  } catch (error) {
    return markSkip(skip("photoshop.app.activeDocument threw; open a document to run this case.", { error: normalizeError(error) }));
  }
}

async function getActiveLayer(
  bridge: { photoshop: any },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown
): Promise<PsLayer | SkipMarker> {
  const document = await getActiveDocument(bridge, skip);
  if (isSkip(document)) {
    return document;
  }
  try {
    const layers = await document.layers;
    const layer = layers[0];
    if (!layer) {
      return markSkip(skip("the active document has no layers."));
    }
    return layer;
  } catch (error) {
    return markSkip(skip("reading document.layers threw.", { error: normalizeError(error) }));
  }
}

function markSkip(skipResult: unknown): SkipMarker {
  // The harness's `skip()` returns its own sentinel; we wrap it so callers can early-return it while
  // keeping a typed guard. The harness recognizes the original sentinel by identity, so we return it
  // as-is but brand the reference for our guard.
  (skipResult as { __skip?: boolean }).__skip = true;
  return skipResult as SkipMarker;
}

async function deleteQuietly(layer: PsLayer | undefined): Promise<void> {
  if (!layer) {
    return;
  }
  try {
    await layer.delete();
  } catch {
    // Best-effort cleanup; assertions own pass/fail.
  }
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { message: String(error) };
}
