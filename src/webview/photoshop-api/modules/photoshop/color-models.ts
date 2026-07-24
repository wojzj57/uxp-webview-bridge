import type {
  CmykColorView,
  GrayColorView,
  HsbColorView,
  LabColorView,
  RgbColorView
} from "./types.js";

function assertRange(name: string, value: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
}

export class CMYKColor implements CmykColorView {
  #black = 0;
  #cyan = 0;
  #magenta = 0;
  #yellow = 0;

  constructor(value: Partial<CmykColorView> = {}) {
    if (value.black !== undefined) this.black = value.black;
    if (value.cyan !== undefined) this.cyan = value.cyan;
    if (value.magenta !== undefined) this.magenta = value.magenta;
    if (value.yellow !== undefined) this.yellow = value.yellow;
  }

  get black(): number { return this.#black; }
  set black(value: number) { this.#black = assertRange("black", value, 0, 100); }
  get cyan(): number { return this.#cyan; }
  set cyan(value: number) { this.#cyan = assertRange("cyan", value, 0, 100); }
  get magenta(): number { return this.#magenta; }
  set magenta(value: number) { this.#magenta = assertRange("magenta", value, 0, 100); }
  get yellow(): number { return this.#yellow; }
  set yellow(value: number) { this.#yellow = assertRange("yellow", value, 0, 100); }
  get typename(): "CMYKColor" { return "CMYKColor"; }
}

export class GrayColor implements GrayColorView {
  #gray = 0;

  constructor(value: Partial<GrayColorView> = {}) {
    if (value.gray !== undefined) this.gray = value.gray;
  }

  get gray(): number { return this.#gray; }
  set gray(value: number) { this.#gray = assertRange("gray", value, 0, 100); }
  get typename(): "GrayColor" { return "GrayColor"; }
}

export class HSBColor implements HsbColorView {
  #brightness = 100;
  #hue = 360;
  #saturation = 0;

  constructor(value: Partial<HsbColorView> = {}) {
    if (value.brightness !== undefined) this.brightness = value.brightness;
    if (value.hue !== undefined) this.hue = value.hue;
    if (value.saturation !== undefined) this.saturation = value.saturation;
  }

  get brightness(): number { return this.#brightness; }
  set brightness(value: number) { this.#brightness = assertRange("brightness", value, 0, 100); }
  get hue(): number { return this.#hue; }
  set hue(value: number) { this.#hue = assertRange("hue", value, 0, 360); }
  get saturation(): number { return this.#saturation; }
  set saturation(value: number) { this.#saturation = assertRange("saturation", value, 0, 100); }
  get typename(): "HSBColor" { return "HSBColor"; }
}

export class LabColor implements LabColorView {
  #a = 0;
  #b = 0;
  #l = 100;

  constructor(value: Partial<LabColorView> = {}) {
    if (value.a !== undefined) this.a = value.a;
    if (value.b !== undefined) this.b = value.b;
    if (value.l !== undefined) this.l = value.l;
  }

  get a(): number { return this.#a; }
  set a(value: number) { this.#a = assertRange("a", value, -128, 127); }
  get b(): number { return this.#b; }
  set b(value: number) { this.#b = assertRange("b", value, -128, 127); }
  get l(): number { return this.#l; }
  set l(value: number) { this.#l = assertRange("l", value, 0, 100); }
  get typename(): "LabColor" { return "LabColor"; }
}

export class RGBColor implements RgbColorView {
  #blue = 255;
  #green = 255;
  #red = 255;

  constructor(value: Partial<RgbColorView> = {}) {
    if (value.red !== undefined) this.red = value.red;
    if (value.green !== undefined) this.green = value.green;
    if (value.blue !== undefined) this.blue = value.blue;
    if (value.hexValue !== undefined) this.hexValue = value.hexValue;
  }

  get blue(): number { return this.#blue; }
  set blue(value: number) { this.#blue = assertRange("blue", value, 0, 255); }
  get green(): number { return this.#green; }
  set green(value: number) { this.#green = assertRange("green", value, 0, 255); }
  get red(): number { return this.#red; }
  set red(value: number) { this.#red = assertRange("red", value, 0, 255); }
  get hexValue(): string {
    return [this.#red, this.#green, this.#blue]
      .map((value) => Math.round(value).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  }
  set hexValue(value: string) {
    const normalized = value.startsWith("#") ? value.slice(1) : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      throw new RangeError("hexValue must contain exactly six hexadecimal digits.");
    }
    this.#red = Number.parseInt(normalized.slice(0, 2), 16);
    this.#green = Number.parseInt(normalized.slice(2, 4), 16);
    this.#blue = Number.parseInt(normalized.slice(4, 6), 16);
  }
  get typename(): "RGBColor" { return "RGBColor"; }
}

export function colorModelData(value: CmykColorView | GrayColorView | HsbColorView | LabColorView | RgbColorView): Record<string, number | string> {
  if ("red" in value) return { red: value.red, green: value.green, blue: value.blue, hexValue: value.hexValue };
  if ("hue" in value) return { hue: value.hue, saturation: value.saturation, brightness: value.brightness };
  if ("cyan" in value) return { cyan: value.cyan, magenta: value.magenta, yellow: value.yellow, black: value.black };
  if ("l" in value) return { l: value.l, a: value.a, b: value.b };
  return { gray: value.gray };
}
