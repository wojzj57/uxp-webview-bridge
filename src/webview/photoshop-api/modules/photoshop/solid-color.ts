import {
  PHOTOSHOP_VALUE_KIND,
  SOLID_COLOR_VALUE_KIND,
  type PhotoshopValueTransport,
  type SolidColorTransport
} from "@shared/photoshop-api/value-objects.js";
import type { ColorModelValue } from "@shared/photoshop-api/photoshop-constants.js";
import type { RemoteArgEncoder } from "@webview/uxp-api/remote/index.js";
import { CMYKColor, GrayColor, HSBColor, LabColor, RGBColor, colorModelData } from "./color-models.js";
import { PathPointInfo, SubPathInfo } from "./path-builders.js";
import type {
  CmykColorView,
  GrayColorView,
  HsbColorView,
  LabColorView,
  PsSolidColor,
  RgbColorView,
  SolidColorInput
} from "./types.js";

const DEFAULT_RGB: RgbColorView = new RGBColor();
type ColorModelName = "rgb" | "hsb" | "cmyk" | "lab" | "gray";

/** WebView-local value object matching Photoshop's constructible SolidColor ergonomics. */
export class SolidColor implements PsSolidColor {
  #model: ColorModelName;
  #rgb: RGBColor;
  #hsb: HSBColor;
  #cmyk: CMYKColor;
  #lab: LabColor;
  #gray: GrayColor;
  readonly typename = "SolidColor";

  constructor(input: ColorModelValue | SolidColorInput = "RGBColor") {
    const source = (typeof input === "string" ? {} : input) as Partial<PsSolidColor>;
    this.#model = typeof input === "string" ? modelFromColorModel(input) : modelFor(source);
    const rgb = {
      ...colorModelData(DEFAULT_RGB),
      ...rgbFor(source, this.#model),
      ...(source.rgb ? colorModelData(source.rgb) : {})
    } as unknown as RgbColorView;
    this.#rgb = new RGBColor({ ...rgb, hexValue: source.rgb?.hexValue ?? rgbHex(rgb.red, rgb.green, rgb.blue) });
    this.#hsb = new HSBColor(source.hsb);
    this.#cmyk = new CMYKColor(source.cmyk);
    this.#lab = new LabColor(source.lab);
    this.#gray = new GrayColor(source.gray);
  }

  get rgb(): RGBColor {
    if (this.#model !== "rgb") this.#rgb = new RGBColor(completeRgb(this.#currentRgb()));
    this.#model = "rgb";
    return this.#rgb;
  }
  set rgb(value: RgbColorView) { this.#model = "rgb"; this.#rgb = new RGBColor(value); }
  get hsb(): HSBColor {
    if (this.#model !== "hsb") this.#hsb = new HSBColor(rgbToHsb(this.#currentRgb()));
    this.#model = "hsb";
    return this.#hsb;
  }
  set hsb(value: HsbColorView) { this.#model = "hsb"; this.#hsb = new HSBColor(value); }
  get cmyk(): CMYKColor {
    if (this.#model !== "cmyk") this.#cmyk = new CMYKColor(rgbToCmyk(this.#currentRgb()));
    this.#model = "cmyk";
    return this.#cmyk;
  }
  set cmyk(value: CmykColorView) { this.#model = "cmyk"; this.#cmyk = new CMYKColor(value); }
  get lab(): LabColor {
    if (this.#model !== "lab") this.#lab = new LabColor(rgbToLab(this.#currentRgb()));
    this.#model = "lab";
    return this.#lab;
  }
  set lab(value: LabColorView) { this.#model = "lab"; this.#lab = new LabColor(value); }
  get gray(): GrayColor {
    if (this.#model !== "gray") this.#gray = new GrayColor(rgbToGray(this.#currentRgb()));
    this.#model = "gray";
    return this.#gray;
  }
  set gray(value: GrayColorView) { this.#model = "gray"; this.#gray = new GrayColor(value); }

  #currentRgb(): RgbColorView {
    if (this.#model === "rgb") return new RGBColor(this.#rgb);
    if (this.#model === "hsb") return completeRgb(rgbFor({ hsb: this.#hsb } as Partial<PsSolidColor>, "hsb"));
    if (this.#model === "cmyk") return completeRgb(rgbFor({ cmyk: this.#cmyk } as Partial<PsSolidColor>, "cmyk"));
    if (this.#model === "lab") return completeRgb(rgbFor({ lab: this.#lab } as Partial<PsSolidColor>, "lab"));
    return completeRgb(rgbFor({ gray: this.#gray } as Partial<PsSolidColor>, "gray"));
  }

  get nearestWebColor(): RGBColor {
    const red = nearestWebChannel(this.rgb.red);
    const green = nearestWebChannel(this.rgb.green);
    const blue = nearestWebChannel(this.rgb.blue);
    return new RGBColor({ red, green, blue });
  }

  isEqual(color: SolidColorInput): boolean {
    const other = color instanceof SolidColor ? color : new SolidColor(color);
    return ["red", "green", "blue"].every(
      (key) => Math.abs(this.rgb[key as keyof Omit<RgbColorView, "hexValue">] - other.rgb[key as keyof Omit<RgbColorView, "hexValue">]) < 0.5
    );
  }

  toInputData(): Partial<SolidColorTransport> {
    const value = ({ rgb: this.#rgb, hsb: this.#hsb, cmyk: this.#cmyk, lab: this.#lab, gray: this.#gray })[this.#model];
    return { [this.#model]: colorModelData(value) };
  }
}

export function createSolidColorFromTransport(value: SolidColorTransport): SolidColor {
  return new SolidColor(value as PsSolidColor);
}

/** Encoder installed on every Photoshop RemoteClass and snapshot collection call. */
export const encodePhotoshopArgument: RemoteArgEncoder = (value) => {
  if (value instanceof PathPointInfo) return value.toInputData();
  if (value instanceof SubPathInfo) return value.toInputData();
  const data = value instanceof SolidColor
    ? value.toInputData()
    : isSolidColorInput(value) ? value : undefined;
  if (data === undefined) return undefined;
  const envelope: PhotoshopValueTransport = {
    kind: PHOTOSHOP_VALUE_KIND,
    valueKind: SOLID_COLOR_VALUE_KIND,
    data
  };
  return envelope;
};

function isSolidColorInput(value: unknown): value is SolidColorInput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["rgb", "hsb", "cmyk", "lab", "gray"].some((key) => record[key] && typeof record[key] === "object");
}

function nearestWebChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value / 51) * 51));
}

function rgbHex(red: number, green: number, blue: number): string {
  return [red, green, blue].map((value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function completeRgb(value: Partial<RgbColorView>): RgbColorView {
  const red = clamp(value.red ?? 255, 0, 255);
  const green = clamp(value.green ?? 255, 0, 255);
  const blue = clamp(value.blue ?? 255, 0, 255);
  return { red, green, blue, hexValue: rgbHex(red, green, blue) };
}

function rgbToHsb({ red, green, blue }: RgbColorView): HsbColorView {
  const [r, g, b] = [red, green, blue].map((value) => clamp(value, 0, 255) / 255) as [number, number, number];
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  const hue = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { hue: (hue + 360) % 360, saturation: max === 0 ? 0 : delta / max * 100, brightness: max * 100 };
}

function rgbToCmyk({ red, green, blue }: RgbColorView): CmykColorView {
  const [r, g, b] = [red, green, blue].map((value) => clamp(value, 0, 255) / 255) as [number, number, number];
  const black = 1 - Math.max(r, g, b);
  if (black >= 1) return { cyan: 0, magenta: 0, yellow: 0, black: 100 };
  return { cyan: (1 - r - black) / (1 - black) * 100, magenta: (1 - g - black) / (1 - black) * 100, yellow: (1 - b - black) / (1 - black) * 100, black: black * 100 };
}

function rgbToGray({ red, green, blue }: RgbColorView): GrayColorView {
  return { gray: 100 * (1 - (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255) };
}

function rgbToLab({ red, green, blue }: RgbColorView): LabColorView {
  const linearize = (value: number) => { const channel = clamp(value, 0, 255) / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
  const r = linearize(red); const g = linearize(green); const b = linearize(blue);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const pivot = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = pivot(x); const fy = pivot(y); const fz = pivot(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function modelFor(source: Partial<PsSolidColor>): ColorModelName {
  const typename = source.typename?.toLowerCase();
  if (typename?.includes("cmyk")) return "cmyk";
  if (typename?.includes("hsb")) return "hsb";
  if (typename?.includes("lab")) return "lab";
  if (typename?.includes("gray")) return "gray";
  for (const model of ["rgb", "hsb", "cmyk", "lab", "gray"] as const) if (source[model]) return model;
  return "rgb";
}

function modelFromColorModel(model: ColorModelValue): ColorModelName {
  if (model === "CMYKColorEnum") return "cmyk";
  if (model === "HSBColorEnum") return "hsb";
  if (model === "labColor") return "lab";
  if (model === "grayScale") return "gray";
  return "rgb";
}

function rgbFor(source: Partial<PsSolidColor>, model: ColorModelName): Partial<RgbColorView> {
  if (source.rgb) return source.rgb;
  if (model === "gray" && source.gray) {
    const channel = 255 * (1 - source.gray.gray / 100); return { red: channel, green: channel, blue: channel };
  }
  if (model === "cmyk" && source.cmyk) {
    const { cyan, magenta, yellow, black } = source.cmyk;
    return { red: 255 * (1 - cyan / 100) * (1 - black / 100), green: 255 * (1 - magenta / 100) * (1 - black / 100), blue: 255 * (1 - yellow / 100) * (1 - black / 100) };
  }
  if (model === "hsb" && source.hsb) {
    const { hue, saturation, brightness } = source.hsb; const s = saturation / 100; const v = brightness / 100;
    const c = v * s; const h = ((hue % 360) + 360) % 360 / 60; const x = c * (1 - Math.abs(h % 2 - 1));
    const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    const m = v - c; return { red: (r + m) * 255, green: (g + m) * 255, blue: (b + m) * 255 };
  }
  if (model === "lab" && source.lab) return labToRgb(source.lab);
  return DEFAULT_RGB;
}

function labToRgb({ l, a, b }: LabColorView): Partial<RgbColorView> {
  const fy = (l + 16) / 116; const fx = a / 500 + fy; const fz = fy - b / 200;
  const pivot = (value: number) => value ** 3 > 0.008856 ? value ** 3 : (value - 16 / 116) / 7.787;
  const x = 0.95047 * pivot(fx); const y = pivot(fy); const z = 1.08883 * pivot(fz);
  const linear = [x * 3.2406 + y * -1.5372 + z * -0.4986, x * -0.9689 + y * 1.8758 + z * 0.0415, x * 0.0557 + y * -0.204 + z * 1.057];
  const gamma = (value: number) => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055);
  return { red: gamma(linear[0]!), green: gamma(linear[1]!), blue: gamma(linear[2]!) };
}
