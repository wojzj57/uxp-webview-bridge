import type { xmp as nativeXmp } from "@shared/types/uxp/internal/xmp.js";
import type { UxpProtocolMethodName } from "@shared/uxp-api/uxp-protocol.js";
import type { RemoteReference } from "@shared/uxp-api/remote-protocol.js";

export interface UxpXmpHostModule {
  readonly xmp: typeof nativeXmp;
}

export type UxpXmpMethodName = Extract<UxpProtocolMethodName, `xmp.${string}`>;

/** Concrete remote class names owned by the xmp module's handle registry. */
export type XmpHandleType = "XMPMeta" | "XMPFile" | "XMPIterator" | "XMPDateTime";

export interface XMPNativeDateEnvelope {
  readonly kind: "uxp.xmp.nativeDate";
  readonly iso: string;
}

export interface XMPSerializedProperty {
  readonly locale?: string;
  readonly namespace?: string;
  readonly options?: number;
  readonly path?: string;
  readonly value?: string | number | boolean | RemoteReference | null;
  readonly stringValue?: string;
}
