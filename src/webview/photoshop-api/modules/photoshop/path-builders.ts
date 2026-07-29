import { PointKind, ShapeOperation } from "@shared/photoshop-api/photoshop-constants.js";
import type { PointKindValue, ShapeOperationValue } from "@shared/photoshop-api/photoshop-constants.js";
import type { PathPointInfoInput, SubPathInfoInput } from "./types.js";

function coordinates(value: readonly number[], name: string): [number, number] {
  if (value.length !== 2 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new TypeError(`${name} must contain exactly two finite coordinates.`);
  }
  return [value[0]!, value[1]!];
}

export class PathPointInfo implements PathPointInfoInput {
  #anchor: [number, number] = [0, 0];
  #kind: PointKindValue = PointKind.CORNERPOINT;
  #leftDirection: [number, number] = [0, 0];
  #rightDirection: [number, number] = [0, 0];

  constructor(value: Partial<PathPointInfoInput> = {}) {
    if (value.anchor !== undefined) this.anchor = value.anchor;
    if (value.kind !== undefined) this.kind = value.kind;
    if (value.leftDirection !== undefined) this.leftDirection = value.leftDirection;
    if (value.rightDirection !== undefined) this.rightDirection = value.rightDirection;
  }

  get anchor(): readonly number[] { return [...this.#anchor]; }
  set anchor(value: readonly number[]) { this.#anchor = coordinates(value, "anchor"); }
  get kind(): PointKindValue { return this.#kind; }
  set kind(value: PointKindValue) {
    if (!Object.values(PointKind).includes(value)) throw new TypeError(`Unsupported PointKind: ${value}.`);
    this.#kind = value;
  }
  get leftDirection(): readonly number[] { return [...this.#leftDirection]; }
  set leftDirection(value: readonly number[]) { this.#leftDirection = coordinates(value, "leftDirection"); }
  get rightDirection(): readonly number[] { return [...this.#rightDirection]; }
  set rightDirection(value: readonly number[]) { this.#rightDirection = coordinates(value, "rightDirection"); }
  get typename(): "PathPointInfo" { return "PathPointInfo"; }

  toInputData(): PathPointInfoInput {
    return {
      anchor: this.anchor,
      kind: this.kind,
      leftDirection: this.leftDirection,
      rightDirection: this.rightDirection
    };
  }
}

export class SubPathInfo implements SubPathInfoInput {
  #closed = false;
  #entireSubPath: readonly PathPointInfoInput[] = [];
  #operation: ShapeOperationValue = ShapeOperation.SHAPEADD;

  constructor(value: Partial<SubPathInfoInput> = {}) {
    if (value.closed !== undefined) this.closed = value.closed;
    if (value.entireSubPath !== undefined) this.entireSubPath = value.entireSubPath;
    if (value.operation !== undefined) this.operation = value.operation;
  }

  get closed(): boolean { return this.#closed; }
  set closed(value: boolean) {
    if (typeof value !== "boolean") throw new TypeError("closed must be a boolean.");
    this.#closed = value;
  }
  get entireSubPath(): readonly PathPointInfoInput[] { return [...this.#entireSubPath]; }
  set entireSubPath(value: readonly PathPointInfoInput[]) {
    if (!Array.isArray(value)) throw new TypeError("entireSubPath must be an array.");
    this.#entireSubPath = Array.from<PathPointInfoInput>(value);
  }
  get operation(): ShapeOperationValue { return this.#operation; }
  set operation(value: ShapeOperationValue) {
    if (!Object.values(ShapeOperation).includes(value)) throw new TypeError(`Unsupported ShapeOperation: ${value}.`);
    this.#operation = value;
  }
  get typename(): "SubPathInfo" { return "SubPathInfo"; }

  toInputData(): SubPathInfoInput {
    return {
      closed: this.closed,
      entireSubPath: this.#entireSubPath.map((point) =>
        point instanceof PathPointInfo ? point.toInputData() : {
          anchor: [...point.anchor],
          kind: point.kind,
          leftDirection: [...point.leftDirection],
          rightDirection: [...point.rightDirection]
        }
      ),
      operation: this.operation
    };
  }
}
