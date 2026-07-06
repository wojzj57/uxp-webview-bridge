import type { xmp as nativeXmp } from "@shared/types/uxp/internal/xmp.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";

export interface UxpXmpHostModule {
  readonly xmp: typeof nativeXmp;
}

export type UxpXmpMethodName = Extract<UxpProtocolMethodName, `xmp.${string}`>;

export interface XMPRemoteReference {
  readonly kind: "uxp.xmp.ref";
  readonly type: "XMPMeta" | "XMPFile" | "XMPIterator" | "XMPDateTime";
  readonly id: string;
}

export interface XMPNativeDateEnvelope {
  readonly kind: "uxp.xmp.nativeDate";
  readonly iso: string;
}

export interface XMPSerializedProperty {
  readonly locale?: string;
  readonly namespace?: string;
  readonly options?: number;
  readonly path?: string;
  readonly value?: string | number | boolean | XMPRemoteReference | null;
  readonly stringValue?: string;
}
