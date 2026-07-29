import {
  assertBoolean,
  assertFiniteNumber,
  assertInteger,
  assertObject,
  assertPositiveNumber,
  assertPositiveInteger,
  assertString
} from "./validation.js";

export function normalizeActiveTool(value: unknown, method: string): Record<string, unknown> {
  const tool = assertObject(value, `${method} result`);
  return {
    title: assertString(tool.title, `${method} result.title`),
    isModal: assertBoolean(tool.isModal, `${method} result.isModal`),
    key: assertString(tool.key, `${method} result.key`),
    classID: assertString(tool.classID ?? tool.classId, `${method} result.classID`)
  };
}

export function normalizeMenuState(value: unknown, method: string): boolean {
  const state: unknown = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return assertBoolean(state, `${method} result`);
}

export function normalizeMenuTitle(value: unknown, method: string): string {
  const title: unknown = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return assertString(title, `${method} result`);
}

export function normalizeMenuCommandResult(value: unknown, method: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const result = assertObject(value, `${method} result`);
  const available = assertBoolean(result.available, `${method} result.available`);
  assertBoolean(result.userCancelled, `${method} result.userCancelled`);
  return available;
}

export function normalizePoint(value: unknown, method: string): Record<string, number> {
  const point = assertObject(value, `${method} result`);
  return {
    x: assertFiniteNumber(point.x, `${method} result.x`),
    y: assertFiniteNumber(point.y, `${method} result.y`)
  };
}

export function normalizeTemporaryDocument(value: unknown, method: string): Record<string, number> {
  const result = assertObject(value, `${method} result`);
  return {
    documentID: assertPositiveInteger(result.documentID, `${method} result.documentID`)
  };
}

export function normalizeLayerTreeList(value: unknown, method: string): Record<string, unknown> {
  const result = assertObject(value, `${method} result`);
  if (!Array.isArray(result.list)) {
    throw new Error(`${method} result.list must be an array.`);
  }
  return {
    list: result.list.map((item, index) =>
      normalizeLayerTreeItem(item, `${method} result.list[${index}]`)
    )
  };
}

export function normalizeSize(value: unknown, label: string): Record<string, number> {
  const size = assertObject(value, label);
  return {
    width: assertPositiveNumber(size.width, `${label}.width`),
    height: assertPositiveNumber(size.height, `${label}.height`)
  };
}

function normalizeLayerTreeItem(value: unknown, label: string): Record<string, unknown> {
  const item = assertObject(value, label);
  const normalized: Record<string, unknown> = {
    name: assertString(item.name, `${label}.name`),
    layerID: assertInteger(item.layerID, `${label}.layerID`),
    kind: assertLayerKind(item.kind ?? item.layerKind, `${label}.kind`)
  };
  const layers = item.layers ?? item.list;
  if (layers !== undefined) {
    if (!Array.isArray(layers)) {
      throw new Error(`${label}.layers must be an array.`);
    }
    normalized.layers = layers.map((child, index) =>
      normalizeLayerTreeItem(child, `${label}.layers[${index}]`)
    );
  }
  return normalized;
}

function assertLayerKind(value: unknown, label: string): string | number {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return assertInteger(value, label);
}
