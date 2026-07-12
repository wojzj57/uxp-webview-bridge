import type { PhotoshopCoreMethodName } from "@shared/photoshop-api/core-protocol.js";

export type CoreMethodName = PhotoshopCoreMethodName;

export interface PhotoshopCoreHost {
  readonly apiVersion: number;
  [member: string]: unknown;
}

export interface PhotoshopCoreHostModule {
  readonly core: PhotoshopCoreHost;
}
