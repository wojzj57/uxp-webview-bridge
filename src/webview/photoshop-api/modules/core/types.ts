export interface Scheduling {
  readonly playLevel?: number;
  readonly eventLevel?: number;
  readonly timeOut?: number;
}

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

/** Read-only/query subset of `require('photoshop').core`, exposed asynchronously across RPC. */
export interface PhotoshopCore {
  readonly apiVersion: Promise<number>;
  getActiveTool(): Promise<GetActiveToolResult>;
  getCPUInfo(): Promise<CPUInfo>;
  getDisplayConfiguration(options?: DisplayConfigurationOptions): Promise<readonly DisplayConfiguration[]>;
  getGPUInfo(): Promise<GPUInfo>;
  getMenuCommandState(options: MenuCommandOptions): Promise<boolean>;
  getMenuCommandTitle(options: MenuCommandOptions | MenuCommandMenuIDOptions): Promise<string>;
  getPluginInfo(): Promise<GetPluginInfoResult>;
  getUserIdleTime(): Promise<number>;
  historySuspended(options: HistorySuspendedOptions): Promise<boolean>;
  isModal(): Promise<boolean>;
  translateUIString(zstring: string): Promise<string>;
}
