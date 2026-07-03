import type { UxpMenuItemInput } from "../../../../../shared/contracts/uxp.js";

export function assertMenuItemInput(value: unknown): asserts value is UxpMenuItemInput {
  if (typeof value === "string") {
    return;
  }

  if (!value || typeof value !== "object") {
    throw new Error("uxp.entrypoints menu item must be a string, separator, or object.");
  }

  const candidate = value as { readonly id?: unknown; readonly submenu?: unknown };
  if (typeof candidate.id !== "string") {
    throw new Error("uxp.entrypoints menu item object requires a string id.");
  }

  if (candidate.submenu !== undefined) {
    if (!Array.isArray(candidate.submenu)) {
      throw new Error("uxp.entrypoints menu item submenu must be an array.");
    }
    for (const child of candidate.submenu) {
      assertMenuItemInput(child);
    }
  }
}
