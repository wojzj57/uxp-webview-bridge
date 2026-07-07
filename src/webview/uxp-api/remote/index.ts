export { RemoteClass } from "./remote-class.js";
export type {
  RemoteClassConfig,
  RemoteConstructionRequest,
  RemoteMethodDescriptor,
  RemoteMethodNames,
  RemotePropertyDescriptor,
  RemoteRpc
} from "./remote-class.js";
export { createIdentityCache } from "./identity-cache.js";
export type { IdentityCache } from "./identity-cache.js";
export {
  decodeRemoteValue,
  encodeRemoteArgs,
  encodeRemoteValue,
  isRemoteReference,
  isRemoteReferenceHolder
} from "./reference.js";
export type { RemoteArgEncoder, RemoteReference, RemoteReferenceHolder, RemoteValueDecoder } from "./reference.js";
