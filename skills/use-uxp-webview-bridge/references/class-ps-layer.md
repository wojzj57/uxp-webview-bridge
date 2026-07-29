# `PsLayer`

Stable remote Photoshop layer.

Read-only properties: `typename`, `id`, `locked`, `isBackgroundLayer`, `kind`, `bounds`, `boundsNoEffects`, `document`, `parent`, `linkedLayers`, `textItem`, child `layers`.

Writable queued properties: `name`, `opacity`, `fillOpacity`, `visible`, `blendMode`, lock flags, `isClippingMask`, filter/layer/vector mask density and feather, `selected`.

The bridge accepts numbers and does not locally clamp opacity. Use Photoshop's normal 0-100 range for `opacity` and `fillOpacity`; the installed host remains authoritative for validation or normalization.

Core methods: `delete`, `duplicate`, `link`, `unlink`, `move`, `translate`, `flip`, `scale`, `rotate`, `skew`, stack front/back, `clear`, `copy`, `cut`, `merge`, `rasterize`, `applyImage`, `batchGet`, `batchSet`, `dispose`.

Transform and relationship signatures:

```ts
duplicate(relative?: PsDocument | PsLayer,
  placement?: ElementPlacementValue, name?: string): RemoteResult<PsLayer | null>;
link(layer: PsLayer): Promise<Layers>;
move(relative: PsLayer, placement: ElementPlacementValue): Promise<void>;
translate(horizontal: number | PercentValue | PixelValue,
  vertical: number | PercentValue | PixelValue): Promise<void>;
flip(axis: FlipAxisValue): Promise<void>;
scale(width: number | PercentValue, height: number | PercentValue,
  anchor?: AnchorPositionValue, options?: { interpolation?: InterpolationMethodValue }): Promise<void>;
rotate(angle: number | AngleValue, anchor?: AnchorPositionValue,
  options?: { interpolation?: InterpolationMethodValue }): Promise<void>;
skew(horizontal: number | AngleValue, vertical: number | AngleValue,
  options?: { interpolation?: InterpolationMethodValue }): Promise<void>;
applyImage(options: { source: ApplyImageSource; blending?: ApplyImageBlendModeValue;
  opacity?: number; preserveTransparency?: boolean; mask?: ApplyImageSource }): Promise<void>;
```

Filters: `applyAddNoise`, `applyAverage`, blur variants, clouds/difference clouds, custom/deinterlace/despeckle/diffuse glow/displace/dust-and-scratches/Gaussian/glass/high-pass/lens blur/lens flare/maximum/minimum/median/motion blur/NTSC/ocean ripple/offset/twirl/pinch/polar/ripple/sharpen/shear/smart blur/spherize/unsharp mask/wave/zigzag.

Common filter signatures:

```ts
applyGaussianBlur(radius: number): Promise<void>;
applyMotionBlur(angle: number, distance: number): Promise<void>;
applyAddNoise(amount: number, distribution: NoiseDistributionValue,
  monochromatic: boolean): Promise<void>;
applyDustAndScratches(radius: number, threshold: number): Promise<void>;
applyHighPass(radius: number): Promise<void>;
applyMaximum(radius: number, preserveShape?: PreserveShapeValue): Promise<void>;
applyMinimum(radius: number, preserveShape?: PreserveShapeValue): Promise<void>;
applyUnSharpMask(amount: number, radius: number, threshold: number): Promise<void>;
applyDisplace(horizontalScale: number, verticalScale: number,
  type: DisplacementMapTypeValue, undefinedAreas: UndefinedAreasValue,
  displacementMapFile: UxpStorageFile): Promise<void>;
```

Filter signatures are strongly typed by the package; use TypeScript completion for their Adobe-specific enum parameters. File-backed filters take `UxpStorageFile`, not raw paths. Mutations are host-modal. Persistent layer proxies normally need no routine disposal. Call `dispose()` only when deliberately abandoning a handle in a long-running workflow, and never reuse that proxy afterward.
