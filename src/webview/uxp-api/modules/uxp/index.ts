import { createUnimplementedNamespace } from "../../../unimplemented-namespace.js";

export interface UxpNamespace {
  readonly versions: Record<string, unknown>;
  readonly storage: Record<string, unknown>;
  readonly shell: Record<string, unknown>;
}

export const uxp: UxpNamespace = {
  versions: createUnimplementedNamespace("uxp.versions"),
  storage: createUnimplementedNamespace("uxp.storage"),
  shell: createUnimplementedNamespace("uxp.shell")
};
