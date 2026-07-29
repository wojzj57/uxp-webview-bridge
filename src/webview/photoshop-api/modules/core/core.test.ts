import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";
import type { PhotoshopNamespace, PsDocument } from "@webview/photoshop-api/modules/photoshop/types.js";

import type {
  CPUInfo as AdobeCPUInfo,
  CreateTemporaryDocumentOptions as AdobeCreateTemporaryDocumentOptions,
  CreateTemporaryDocumentResult as AdobeCreateTemporaryDocumentResult,
  DeleteTemporaryDocumentOptions as AdobeDeleteTemporaryDocumentOptions,
  DisplayConfiguration as AdobeDisplayConfiguration,
  DisplayConfigurationOptions as AdobeDisplayConfigurationOptions,
  GetActiveToolResult as AdobeGetActiveToolResult,
  GetPluginInfoResult as AdobeGetPluginInfoResult,
  GPUInfo as AdobeGPUInfo,
  LayerTreeInfo as AdobeLayerTreeInfo,
  MenuCommandMenuIDOptions as AdobeMenuCommandMenuIDOptions,
  MenuCommandOptions as AdobeMenuCommandOptions,
  RedrawDocumentOptions as AdobeRedrawDocumentOptions,
  SetExecutionModeOptions as AdobeSetExecutionModeOptions,
  SuppressResizeGripperOptions as AdobeSuppressResizeGripperOptions
} from "@shared/types/photoshop/internal/dom/CoreModules.js";
import type {
  CMYKColorDescriptor as AdobeCMYKColorDescriptor,
  ColorDescriptor as AdobeColorDescriptor,
  GrayscaleColorDescriptor as AdobeGrayscaleColorDescriptor,
  HSBColorDescriptor as AdobeHSBColorDescriptor,
  LabColorDescriptor as AdobeLabColorDescriptor,
  RGB32ColorDescriptor as AdobeRGB32ColorDescriptor,
  RGBColorDescriptor as AdobeRGBColorDescriptor
} from "@shared/types/photoshop/internal/util/colorTypes.js";
import type {
  CMYKColorDescriptor,
  ColorDescriptor,
  CPUInfo,
  CreateTemporaryDocumentOptions,
  CreateTemporaryDocumentResult,
  DeleteTemporaryDocumentOptions,
  DisplayConfiguration,
  DisplayConfigurationOptions,
  GetActiveToolResult,
  GetPluginInfoResult,
  GrayscaleColorDescriptor,
  GPUInfo,
  HSBColorDescriptor,
  LabColorDescriptor,
  LayerTreeInfo,
  MenuCommandMenuIDOptions,
  MenuCommandOptions,
  RGB32ColorDescriptor,
  RGBColorDescriptor,
  RedrawDocumentOptions,
  SetExecutionModeOptions,
  SuppressResizeGripperOptions
} from "./types.js";

type Assignable<From, To> = [From] extends [To] ? true : never;

// `classID` follows ps-reference; the bundled declaration uses `classId`, so compare the stable fields.
type ActiveToolStable<T> = Omit<T, "classID" | "classId">;
type _ActiveToolStable = Assignable<ActiveToolStable<GetActiveToolResult>, ActiveToolStable<AdobeGetActiveToolResult>>;
type _CpuInfo = Assignable<CPUInfo, AdobeCPUInfo>;
type _GpuInfo = Assignable<GPUInfo, AdobeGPUInfo>;
type _DisplayOptions = Assignable<DisplayConfigurationOptions, AdobeDisplayConfigurationOptions>;
type _DisplayResult = Assignable<DisplayConfiguration, AdobeDisplayConfiguration>;
type _MenuCommandOptions = Assignable<MenuCommandOptions, AdobeMenuCommandOptions>;
type _MenuIdOptions = Assignable<MenuCommandMenuIDOptions, AdobeMenuCommandMenuIDOptions>;
type _CreateTemporaryOptions = Assignable<CreateTemporaryDocumentOptions, AdobeCreateTemporaryDocumentOptions>;
type _CreateTemporaryResult = Assignable<CreateTemporaryDocumentResult, AdobeCreateTemporaryDocumentResult>;
type _DeleteTemporaryOptions = Assignable<DeleteTemporaryDocumentOptions, AdobeDeleteTemporaryDocumentOptions>;
type _RedrawDocumentOptions = Assignable<RedrawDocumentOptions, AdobeRedrawDocumentOptions>;
type _SetExecutionModeOptions = Assignable<SetExecutionModeOptions, AdobeSetExecutionModeOptions>;
type _SuppressResizeGripperOptions = Assignable<SuppressResizeGripperOptions, AdobeSuppressResizeGripperOptions>;
type _PluginInfo = Assignable<GetPluginInfoResult, AdobeGetPluginInfoResult>;
type _ColorDescriptor = Assignable<ColorDescriptor, AdobeColorDescriptor>;
type _RgbColor = Assignable<RGBColorDescriptor, AdobeRGBColorDescriptor>;
type _Rgb32Color = Assignable<RGB32ColorDescriptor, AdobeRGB32ColorDescriptor>;
type _HsbColor = Assignable<HSBColorDescriptor, AdobeHSBColorDescriptor>;
type _CmykColor = Assignable<CMYKColorDescriptor, AdobeCMYKColorDescriptor>;
type _LabColor = Assignable<LabColorDescriptor, AdobeLabColorDescriptor>;
type _GrayColor = Assignable<GrayscaleColorDescriptor, AdobeGrayscaleColorDescriptor>;
type LayerTreeStable<T> = Omit<T, "kind" | "layers">;
type _LayerTree = Assignable<LayerTreeStable<LayerTreeInfo>, LayerTreeStable<AdobeLayerTreeInfo>>;

export type _StaticConsistencyProof = [
  _ActiveToolStable,
  _CpuInfo,
  _GpuInfo,
  _DisplayOptions,
  _DisplayResult,
  _MenuCommandOptions,
  _MenuIdOptions,
  _CreateTemporaryOptions,
  _CreateTemporaryResult,
  _DeleteTemporaryOptions,
  _RedrawDocumentOptions,
  _SetExecutionModeOptions,
  _SuppressResizeGripperOptions,
  _PluginInfo,
  _ColorDescriptor,
  _RgbColor,
  _Rgb32Color,
  _HsbColor,
  _CmykColor,
  _LabColor,
  _GrayColor,
  _LayerTree
];

export default defineWebviewCdpCases([
  {
    name: "photoshop.core.public-shape",
    run({ bridge, assert }) {
      const core = bridge.photoshop.core;
      assert.ok(typeof core === "object" && core !== null, "photoshop.core must be an object.");
      assert.ok("apiVersion" in core, "photoshop.core.apiVersion must exist.");
      assert.functions(
        core,
        [
          "addNotificationListener",
          "getActiveTool",
          "calculateDialogSize",
          "convertColor",
          "convertGlobalToLocal",
          "createTemporaryDocument",
          "deleteTemporaryDocument",
          "endModalToolState",
          "executeAsModal",
          "getCPUInfo",
          "getDisplayConfiguration",
          "getGPUInfo",
          "getLayerGroupContents",
          "getLayerGroupContentsSync",
          "getLayerTree",
          "getLayerTreeSync",
          "getMenuCommandState",
          "getMenuCommandTitle",
          "getPluginInfo",
          "getUserIdleTime",
          "historySuspended",
          "isModal",
          "performMenuCommand",
          "redrawDocument",
          "removeNotificationListener",
          "setExecutionMode",
          "setUserIdleTime",
          "showAlert",
          "suppressResizeGripper",
          "translateUIString"
        ],
        "photoshop.core"
      );
      return {
        membersChecked: 31,
        nonCallbackMembersChecked: 28,
        callbackMembersChecked: 3
      };
    }
  },
  {
    name: "photoshop.core.utility-queries",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();
      const dialogSize = await bridge.photoshop.core.calculateDialogSize({
        preferredSize: { width: 200, height: 300 },
        minimumSize: { width: 100, height: 100 }
      });
      const converted = await bridge.photoshop.core.convertColor(
        { _obj: "RGBColor", red: 128, green: 128, blue: 128 },
        bridge.photoshop.ColorConversionModel.Lab
      );

      assert.ok(dialogSize.width >= 100 && dialogSize.height >= 100, "dialog size should respect minimums.");
      assert.equal(converted._obj, "labColor", "convertColor should return a Lab descriptor.");
      assert.ok(Number.isFinite(converted.luminance), "converted luminance should be finite.");

      return { dialogSize, colorModel: converted._obj, luminance: converted.luminance };
    }
  },
  {
    name: "photoshop.core.environment-queries",
    async run({ bridge, assert }) {
      bridge.ensureConfigured();
      const core = bridge.photoshop.core;

      const apiVersion = await core.apiVersion;
      const activeTool = await core.getActiveTool();
      const cpu = await core.getCPUInfo();
      const gpu = await core.getGPUInfo();
      const displays = await core.getDisplayConfiguration({ physicalResolution: true });
      const pluginInfo = await core.getPluginInfo();
      const idleTime = await core.getUserIdleTime();
      const modal = await core.isModal();
      const translated = await core.translateUIString("$$$/UXP/CoreBridgeTest=Core Bridge Test");

      assert.ok(typeof apiVersion === "number" && Number.isFinite(apiVersion), "apiVersion should be finite.");
      assert.nonEmptyString(activeTool.title, "getActiveTool.title");
      assert.nonEmptyString(activeTool.classID, "getActiveTool.classID");
      assert.ok(typeof activeTool.isModal === "boolean", "getActiveTool.isModal should be boolean.");
      assert.ok(typeof cpu.logicalCores === "number" && cpu.logicalCores > 0, "CPU logicalCores should be positive.");
      assert.nonEmptyString(cpu.vendor, "CPU vendor");
      assert.ok(typeof gpu === "object" && gpu !== null, "GPU info should be an object.");
      assert.ok(Array.isArray(displays) && displays.length > 0, "display configuration should be non-empty.");
      assert.ok(typeof pluginInfo === "object" && pluginInfo !== null, "plugin info should be an object.");
      assert.ok(typeof idleTime === "number" && idleTime >= 0, "idle time should be non-negative.");
      assert.equal(modal, false, "the query should run outside a modal scope.");
      assert.nonEmptyString(translated, "translated UI string");

      return {
        apiVersion,
        toolClassID: activeTool.classID,
        cpuVendor: cpu.vendor,
        displayCount: displays.length,
        idleTime,
        translated
      };
    }
  },
  {
    name: "photoshop.core.document-queries",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      return withFixtureDocument(bridge, skip, "document-queries", async (document) => {
        const documentID = await document.id;
        const suspended = await bridge.photoshop.core.historySuspended({ documentID });
        const menuAvailable = await bridge.photoshop.core.getMenuCommandState({ commandID: 1017 });
        const menuTitle = await bridge.photoshop.core.getMenuCommandTitle({ commandID: 1017 });

        assert.ok(typeof suspended === "boolean", "historySuspended should return a boolean.");
        assert.ok(typeof menuAvailable === "boolean", "getMenuCommandState should return a boolean.");
        assert.nonEmptyString(menuTitle, "getMenuCommandTitle");

        return { documentID, suspended, menuAvailable, menuTitle };
      });
    }
  },
  {
    name: "photoshop.core.layer-hierarchy",
    async run({ bridge, assert, skip }) {
      bridge.ensureConfigured();
      return withFixtureDocument(bridge, skip, "layer-hierarchy", async (document) => {
        const documentID = await document.id;
        const group = await document.createLayerGroup({ name: `uxp-core-tree-${Date.now()}` });
        if (group === null) {
          return skip("photoshop.app.createLayerGroup returned null.");
        }
        const layerID = await group.id;
        const asyncTree = await bridge.photoshop.core.getLayerTree({ documentID });
        const syncTree = await bridge.photoshop.core.getLayerTreeSync({ documentID });
        const asyncContents = await bridge.photoshop.core.getLayerGroupContents({ documentID, layerID });
        const syncContents = await bridge.photoshop.core.getLayerGroupContentsSync({ documentID, layerID });

        assertLayerHierarchy(assert, layerID, asyncTree, syncTree, asyncContents, syncContents);
        return { documentID, layerID, asyncTreeCount: asyncTree.list.length, syncTreeCount: syncTree.list.length };
      });
    }
  }
]);

interface LayerTreeLike {
  readonly layerID: number;
  readonly layers?: readonly LayerTreeLike[];
}

interface LayerTreeListLike {
  readonly list: readonly LayerTreeLike[];
}

interface CdpAssertLike {
  ok(value: unknown, message: string): void;
  equal(actual: unknown, expected: unknown, message: string): void;
}

function assertLayerHierarchy(
  assert: CdpAssertLike,
  layerID: number,
  asyncTree: LayerTreeListLike,
  syncTree: LayerTreeListLike,
  asyncContents: LayerTreeListLike,
  syncContents: LayerTreeListLike
): void {
  assert.ok(treeContainsLayer(asyncTree.list, layerID), "async layer tree should contain the temporary group.");
  assert.ok(treeContainsLayer(syncTree.list, layerID), "sync layer tree should contain the temporary group.");
  assert.equal(asyncContents.list.length, 0, "new group should have no async contents.");
  assert.equal(syncContents.list.length, 0, "new group should have no sync contents.");
}

function treeContainsLayer(items: readonly LayerTreeLike[], layerID: number): boolean {
  return items.some((item) =>
    item.layerID === layerID || (item.layers !== undefined && treeContainsLayer(item.layers, layerID))
  );
}

async function withFixtureDocument<T>(
  bridge: { photoshop: PhotoshopNamespace },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown,
  caseLabel: string,
  run: (document: PsDocument) => Promise<T>
): Promise<unknown> {
  let document: PsDocument | null;
  try {
    document = await bridge.photoshop.app.createDocument({
      name: `uxp-webview-bridge-${caseLabel}-${Date.now()}`,
      width: 64,
      height: 64,
      resolution: 72
    });
  } catch (error) {
    return skip("photoshop.core could not create an isolated fixture document.", {
      message: error instanceof Error ? error.message : String(error)
    });
  }

  if (document === null) {
    return skip("photoshop.app.createDocument returned null; no user document was modified.");
  }

  try {
    return await run(document);
  } finally {
    await document.closeWithoutSaving();
  }
}
