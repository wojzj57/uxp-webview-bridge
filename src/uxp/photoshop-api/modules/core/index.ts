export {
  configureCoreAdapter,
  coreModuleAdapter,
  destroyCoreAdapter,
  dispatchCoreCall
} from "./host.js";
export type { CoreMethodName, PhotoshopCoreHost, PhotoshopCoreHostModule } from "./types.js";
export {
  createTemporaryDocumentOwner,
  DEFAULT_TEMPORARY_DOCUMENT_TTL_MS
} from "./temporary-document-owner.js";
export type {
  TemporaryDocumentDeleteResult,
  TemporaryDocumentDeleteExecutor,
  TemporaryDocumentOwner,
  TemporaryDocumentOwnerOptions
} from "./temporary-document-owner.js";
