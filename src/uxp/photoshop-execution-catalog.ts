import {
  PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES,
  PHOTOSHOP_CORE_METHOD_NAMES,
  PHOTOSHOP_CORE_MODULE_ID
} from "../shared/photoshop-api/core-protocol.js";
import {
  PHOTOSHOP_IMAGING_METHOD_NAMES,
  PHOTOSHOP_IMAGING_MODULE_ID
} from "../shared/photoshop-api/imaging-protocol.js";
import {
  PHOTOSHOP_METHOD_NAMES,
  PHOTOSHOP_MODULE_ID
} from "../shared/photoshop-api/photoshop-protocol.js";

export type PhotoshopExecutionClass =
  | "read"
  | "modal-entry"
  | "modal-aware-mutation"
  | "nested-only";

export interface PhotoshopExecutionCatalogEntry {
  readonly moduleId: string;
  readonly method: string;
  readonly executionClass: PhotoshopExecutionClass;
}

const CORE_MUTATIONS = new Set<string>([
  "core.createTemporaryDocument",
  "core.deleteTemporaryDocument",
  "core.endModalToolState",
  "core.redrawDocument",
  "core.setExecutionMode",
  "core.setUserIdleTime",
  "core.suppressResizeGripper"
]);

const IMAGING_LOCAL_READS = new Set<string>([
  "imaging.encodeImageData",
  "imaging.imageData.getData",
  "imaging.imageData.dispose"
]);

const catalogEntries: PhotoshopExecutionCatalogEntry[] = [];
const add = (
  moduleId: string,
  methods: readonly string[],
  classify: (method: string) => PhotoshopExecutionClass
): void => {
  for (const method of methods) {
    catalogEntries.push({ moduleId, method, executionClass: classify(method) });
  }
};

add(PHOTOSHOP_CORE_MODULE_ID, PHOTOSHOP_CORE_METHOD_NAMES, (method) => {
  if (method === "core.executeAsModal") return "modal-entry";
  return CORE_MUTATIONS.has(method) ? "modal-aware-mutation" : "read";
});
add(PHOTOSHOP_CORE_MODULE_ID, PHOTOSHOP_CORE_INTERNAL_METHOD_NAMES, () => "nested-only");
add(PHOTOSHOP_IMAGING_MODULE_ID, PHOTOSHOP_IMAGING_METHOD_NAMES, (method) =>
  IMAGING_LOCAL_READS.has(method) ? "read" : "modal-aware-mutation"
);
add(PHOTOSHOP_MODULE_ID, PHOTOSHOP_METHOD_NAMES, classifyDomMethod);

const catalog = new Map<string, PhotoshopExecutionClass>();
for (const entry of catalogEntries) {
  const key = catalogKey(entry.moduleId, entry.method);
  if (catalog.has(key)) throw new Error(`Duplicate Photoshop execution catalog entry: ${key}`);
  catalog.set(key, entry.executionClass);
}

export const PHOTOSHOP_EXECUTION_CATALOG = Object.freeze([...catalogEntries]);

export function resolvePhotoshopExecutionClass(
  moduleId: string,
  method: string
): PhotoshopExecutionClass | undefined {
  return catalog.get(catalogKey(moduleId, method));
}

function classifyDomMethod(method: string): PhotoshopExecutionClass {
  if (
    method.endsWith(".dispose") ||
    method.endsWith(".propertyGet") ||
    method.endsWith(".propertyGetSync") ||
    method.endsWith(".batchGet") ||
    method.endsWith(".getData") ||
    /\.(get|find)[A-Z]/.test(method) ||
    /\.(getAll|getById|getByName|getByIndex|index|length)$/.test(method)
  ) {
    return "read";
  }
  return "modal-aware-mutation";
}

function catalogKey(moduleId: string, method: string): string {
  return `${moduleId}\u0000${method}`;
}
