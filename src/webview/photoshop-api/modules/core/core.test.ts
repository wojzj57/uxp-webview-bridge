import { defineWebviewCdpCases } from "@test/cdp/webview-cases.js";

import type {
  CPUInfo as AdobeCPUInfo,
  DisplayConfiguration as AdobeDisplayConfiguration,
  DisplayConfigurationOptions as AdobeDisplayConfigurationOptions,
  GetActiveToolResult as AdobeGetActiveToolResult,
  GetPluginInfoResult as AdobeGetPluginInfoResult,
  GPUInfo as AdobeGPUInfo,
  MenuCommandMenuIDOptions as AdobeMenuCommandMenuIDOptions,
  MenuCommandOptions as AdobeMenuCommandOptions
} from "@shared/types/photoshop/internal/dom/CoreModules.js";
import type {
  CPUInfo,
  DisplayConfiguration,
  DisplayConfigurationOptions,
  GetActiveToolResult,
  GetPluginInfoResult,
  GPUInfo,
  MenuCommandMenuIDOptions,
  MenuCommandOptions
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
type _PluginInfo = Assignable<GetPluginInfoResult, AdobeGetPluginInfoResult>;

export type _StaticConsistencyProof = [
  _ActiveToolStable,
  _CpuInfo,
  _GpuInfo,
  _DisplayOptions,
  _DisplayResult,
  _MenuCommandOptions,
  _MenuIdOptions,
  _PluginInfo
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
          "getActiveTool",
          "getCPUInfo",
          "getDisplayConfiguration",
          "getGPUInfo",
          "getMenuCommandState",
          "getMenuCommandTitle",
          "getPluginInfo",
          "getUserIdleTime",
          "historySuspended",
          "isModal",
          "translateUIString"
        ],
        "photoshop.core"
      );
      return { membersChecked: 12 };
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
      const document = await getActiveDocument(bridge, skip);
      if (isSkip(document)) {
        return document;
      }
      const documentID = await document.id;
      const suspended = await bridge.photoshop.core.historySuspended({ documentID });
      const menuAvailable = await bridge.photoshop.core.getMenuCommandState({ commandID: 1017 });
      const menuTitle = await bridge.photoshop.core.getMenuCommandTitle({ commandID: 1017 });

      assert.ok(typeof suspended === "boolean", "historySuspended should return a boolean.");
      assert.ok(typeof menuAvailable === "boolean", "getMenuCommandState should return a boolean.");
      assert.nonEmptyString(menuTitle, "getMenuCommandTitle");

      return { documentID, suspended, menuAvailable, menuTitle };
    }
  }
]);

interface SkipMarker {
  readonly __skip: true;
}

interface ActiveDocumentLike {
  readonly id: Promise<number>;
}

function isSkip(value: unknown): value is SkipMarker {
  return typeof value === "object" && value !== null && (value as SkipMarker).__skip === true;
}

async function getActiveDocument(
  bridge: { photoshop: { app: { activeDocument: Promise<ActiveDocumentLike> } } },
  skip: (reason: string, diagnostics?: Record<string, unknown>) => unknown
): Promise<ActiveDocumentLike | SkipMarker> {
  try {
    return await bridge.photoshop.app.activeDocument;
  } catch (error) {
    const result = skip("photoshop.core document queries require an active document.", {
      message: error instanceof Error ? error.message : String(error)
    });
    (result as { __skip?: boolean }).__skip = true;
    return result as SkipMarker;
  }
}
