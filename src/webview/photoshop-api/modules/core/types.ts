export interface Scheduling {
  readonly playLevel?: number;
  readonly eventLevel?: number;
  readonly timeOut?: number;
}

export interface CoreSize {
  readonly width: number;
  readonly height: number;
}

export interface CorePoint {
  readonly x: number;
  readonly y: number;
}

export interface CalculateDialogSizeOptions {
  readonly preferredSize: CoreSize;
  readonly identifier?: string;
  readonly minimumSize?: CoreSize;
}

export const ColorConversionModel = {
  HSB: 4,
  CMYK: 5,
  Lab: 6,
  RGB: 15,
  Gray: 16
} as const;

export type ColorConversionModel =
  (typeof ColorConversionModel)[keyof typeof ColorConversionModel];

export interface RGBColorDescriptor {
  readonly _obj: "RGBColor";
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface RGB32ColorDescriptor {
  readonly _obj: "RGBColor";
  readonly greenFloat: number;
  readonly redFloat: number;
  readonly blueFloat: number;
}

export interface HSBColorDescriptor {
  readonly _obj: "HSBColorClass";
  readonly hue: {
    readonly _unit: "angleUnit";
    readonly _value: number;
  };
  readonly saturation: number;
  readonly brightness: number;
}

export interface CMYKColorDescriptor {
  readonly _obj: "CMYKColorClass";
  readonly cyan: number;
  readonly magenta: number;
  readonly yellowColor: number;
  readonly black: number;
}

export interface LabColorDescriptor {
  readonly _obj: "labColor";
  readonly luminance: number;
  readonly a: number;
  readonly b: number;
}

export interface GrayscaleColorDescriptor {
  readonly _obj: "grayscale";
  readonly gray: number;
}

export type ColorDescriptor =
  | RGBColorDescriptor
  | RGB32ColorDescriptor
  | HSBColorDescriptor
  | CMYKColorDescriptor
  | LabColorDescriptor
  | GrayscaleColorDescriptor;

export type ConvertedColor<Model extends ColorConversionModel> =
  Model extends typeof ColorConversionModel.RGB
    ? RGBColorDescriptor | RGB32ColorDescriptor
    : Model extends typeof ColorConversionModel.Lab
      ? LabColorDescriptor
      : Model extends typeof ColorConversionModel.HSB
        ? HSBColorDescriptor
        : Model extends typeof ColorConversionModel.Gray
          ? GrayscaleColorDescriptor
          : CMYKColorDescriptor;

export interface CPUInfo {
  readonly vendor: "Intel" | "AMD" | "ARM" | "Unknown";
  readonly physicalCores: number;
  readonly logicalCores: number;
  readonly frequencyMhz: number;
  readonly emulationMode?: "rosetta2";
}

export interface OpenGLDeviceInfo {
  readonly version: string;
  readonly memoryMB: number;
  readonly name: string;
  readonly driverVersion: string;
  readonly vendor: string;
  readonly isIntegrated: string;
  readonly glDriver: string;
}

export interface OpenCLDeviceInfo {
  readonly version: string;
  readonly memoryMB: number;
  readonly name: string;
  readonly driverVersion: string;
  readonly vendor: string;
  readonly isIntegrated: string;
  readonly oclBandwidth: number;
  readonly oclCompute: number;
  readonly clDeviceVersion: string;
  readonly clPlatformVersion: string;
}

export interface GPUInfo {
  readonly gpuInfoList?: readonly OpenGLDeviceInfo[];
  readonly clgpuInfoList?: readonly OpenCLDeviceInfo[];
}

export interface DisplayConfigurationBounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface DisplayConfigurationPhysical {
  readonly horizontal: number;
  readonly vertical: number;
}

export interface DisplayConfiguration {
  readonly isPrimary: boolean;
  readonly scaleFactor: number;
  readonly globalBounds: DisplayConfigurationBounds;
  readonly globalWorkingBounds: DisplayConfigurationBounds;
  readonly physicalResolution?: DisplayConfigurationPhysical;
}

export interface DisplayConfigurationOptions {
  readonly physicalResolution?: boolean;
}

/** Canonical ps-reference shape; the bundled declaration spells `classID` as `classId`. */
export interface GetActiveToolResult {
  readonly title: string;
  readonly isModal: boolean;
  readonly key: string;
  readonly classID: string;
}

export interface GetPluginInfoResult {
  readonly _obj: "pluginInfo";
  readonly batchPlayCount: number;
  readonly isFirstParty: boolean;
  readonly launchTimeImpact: number;
  readonly mainThreadTimeOutCount: number;
  readonly mainThreadUnhandledExceptionCount: number;
  readonly name?: string;
  readonly numberOfPendingMainThreadTasks: number;
  readonly path?: string;
  readonly pendingDeferralCount: number;
  readonly pluginLoadTime: number;
  readonly usedMainThreadTime: number;
  readonly v8HeapSize: number;
  readonly version?: string;
  readonly [property: string]: unknown;
}

export interface MenuCommandOptions {
  readonly commandID: number;
  readonly scheduling?: Scheduling;
}

export interface MenuCommandMenuIDOptions {
  readonly menuID: number;
  readonly scheduling?: Scheduling;
}

export interface HistorySuspendedOptions {
  readonly documentID: number;
}

export interface DocumentCoreOptions {
  readonly documentID: number;
}

export type CreateTemporaryDocumentOptions = DocumentCoreOptions;

export type CreateTemporaryDocumentResult = DocumentCoreOptions;

export type DeleteTemporaryDocumentOptions = DocumentCoreOptions;

export type RedrawDocumentOptions = DocumentCoreOptions;

export interface SetExecutionModeOptions {
  readonly enableErrorStacktraces?: boolean;
  readonly logRejections?: boolean;
}

export interface ShowAlertOptions {
  readonly message: string;
}

export interface SuppressResizeGripperOptions {
  readonly type: "panel";
  readonly target: string;
  readonly value: boolean;
}

export interface GetLayerGroupContentsOptions extends DocumentCoreOptions {
  readonly layerID: number;
}

export interface LayerTreeInfo {
  readonly name: string;
  readonly layerID: number;
  /** String in current declarations; legacy Photoshop hosts return a numeric `layerKind`. */
  readonly kind: string | number;
  readonly layers?: readonly LayerTreeInfo[];
}

export interface LayerTreeList {
  readonly list: readonly LayerTreeInfo[];
}

export type CoreNotificationDescriptor = Readonly<Record<string, unknown>>;

export type CoreNotificationListener = (
  eventName: string,
  descriptor: CoreNotificationDescriptor
) => void | Promise<void>;

export interface ExecuteAsModalOptions {
  readonly commandName: string;
  readonly descriptor?: CoreNotificationDescriptor;
  readonly interactive?: boolean;
  readonly timeOut?: number;
}

export interface CoreCancellationEvent {
  readonly reason: string;
}

export interface ReportProgressOptions {
  readonly value?: number;
  readonly commandName?: string;
}

export interface HistoryStateInfo {
  readonly documentID: number;
  readonly name: string;
}

export interface HistorySuspension {
  readonly historySuspensionID: number;
}

export interface ResumeHistoryOptions extends HistorySuspension {
  readonly finalName?: string;
}

export interface ExecutionHostControl {
  suspendHistory(options: HistoryStateInfo): Promise<HistorySuspension>;
  resumeHistory(suspension: ResumeHistoryOptions, commit?: boolean): Promise<void>;
  registerAutoCloseDocument(documentID: number): Promise<void>;
  unregisterAutoCloseDocument(documentID: number): Promise<void>;
}

export interface ExecutionContext {
  readonly isCancelled: boolean;
  onCancel: ((event?: CoreCancellationEvent) => void | Promise<void>) | undefined;
  reportProgress(options: ReportProgressOptions): void;
  readonly hostControl: ExecutionHostControl;
}

export type ExecuteAsModalTarget<Result> = (
  executionContext: ExecutionContext,
  descriptor?: CoreNotificationDescriptor
) => Result | Promise<Result>;

/** `require('photoshop').core`, exposed asynchronously across RPC. */
export interface PhotoshopCore {
  readonly apiVersion: Promise<number>;
  addNotificationListener(
    group: string,
    events: readonly string[],
    listener: CoreNotificationListener
  ): Promise<void>;
  calculateDialogSize(options: CalculateDialogSizeOptions): Promise<CoreSize>;
  convertColor<Model extends ColorConversionModel>(
    sourceColor: ColorDescriptor,
    targetModel: Model
  ): Promise<ConvertedColor<Model>>;
  convertGlobalToLocal(target: string, location: CorePoint): Promise<CorePoint>;
  createTemporaryDocument(options: CreateTemporaryDocumentOptions): Promise<CreateTemporaryDocumentResult>;
  deleteTemporaryDocument(options: DeleteTemporaryDocumentOptions): Promise<void>;
  endModalToolState(commit: boolean): Promise<void>;
  executeAsModal<Result>(
    target: ExecuteAsModalTarget<Result>,
    options: ExecuteAsModalOptions
  ): Promise<Result>;
  getActiveTool(): Promise<GetActiveToolResult>;
  getCPUInfo(): Promise<CPUInfo>;
  getDisplayConfiguration(options?: DisplayConfigurationOptions): Promise<readonly DisplayConfiguration[]>;
  getGPUInfo(): Promise<GPUInfo>;
  getLayerGroupContents(options: GetLayerGroupContentsOptions): Promise<LayerTreeList>;
  getLayerGroupContentsSync(options: GetLayerGroupContentsOptions): Promise<LayerTreeList>;
  getLayerTree(options: DocumentCoreOptions): Promise<LayerTreeList>;
  getLayerTreeSync(options: DocumentCoreOptions): Promise<LayerTreeList>;
  getMenuCommandState(options: MenuCommandOptions): Promise<boolean>;
  getMenuCommandTitle(options: MenuCommandOptions | MenuCommandMenuIDOptions): Promise<string>;
  getPluginInfo(): Promise<GetPluginInfoResult>;
  getUserIdleTime(): Promise<number>;
  historySuspended(options: HistorySuspendedOptions): Promise<boolean>;
  isModal(): Promise<boolean>;
  performMenuCommand(options: MenuCommandOptions): Promise<boolean>;
  redrawDocument(options: RedrawDocumentOptions): Promise<number>;
  removeNotificationListener(
    group: string,
    events: readonly string[],
    listener: CoreNotificationListener
  ): Promise<void>;
  setExecutionMode(options: SetExecutionModeOptions): Promise<void>;
  setUserIdleTime(idleTime: number): Promise<void>;
  showAlert(options: ShowAlertOptions): Promise<void>;
  suppressResizeGripper(options: SuppressResizeGripperOptions): Promise<void>;
  translateUIString(zstring: string): Promise<string>;
}
