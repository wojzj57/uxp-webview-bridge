# Photoshop constants

`photoshop` implements the exported synchronous `PhotoshopConstantsNamespace`. Prefer `photoshop.constants.Xxx` when mirroring native Adobe code; matching direct tables are also available where declared.

```ts
const blend = photoshop.constants.BlendMode.MULTIPLY;
layer.blendMode = blend;
```

Constants cross no RPC and need no `await`. Use the package's TypeScript completion for exact table/member names. `ColorConversionModel` is a separate synchronous table with `HSB`, `CMYK`, `Lab`, `RGB`, and `Gray` numeric values.

Available table names include: `InterpolationMethod`, `ResampleMethod`, `SaveMethod`, `SaveOptions`, `BMPDepthType`, `BitsPerChannelType`, `DepthMapSource`, `OperatingSystem`, `JPEGFormatOptions`, `MatteColor`, `Dither`, `ForcedColors`, `Palette`, `PNGMethod`, `AnchorPosition`, `TrimType`, `LabelColors`, `BlendMode`, `ColorBlendMode`, `CalculationsBlendMode`, `ApplyImageBlendMode`, `DocumentMode`, `NewDocumentMode`, `Units`, `ChangeMode`, `DocumentFill`, `LayerKind`, `ElementPlacement`, `ColorProfileType`, `BitmapConversionType`, `BitmapHalfToneType`, `Intent`, `Direction`, `Orientation`, `ColorModel`, `RasterizeType`, `DialogModes`, `DisplacementMapType`, `ChannelType`, `NoiseDistribution`, `EliminateFields`, `Geometry`, `CreateFields`, `PathKind`, `SelectionType`, `ToolType`, `PointKind`, `ShapeOperation`, `TextureType`, `UndefinedAreas`, `PolarConversionType`, `RadialBlurMethod`, `RadialBlurQuality`, `RippleSize`, `SmartBlurQuality`, `SmartBlurMode`, `SpherizeMode`, `WaveType`, `ZigZagType`, `LensType`, `PreserveShape`, `OffsetUndefinedAreas`, `SampleSize`, all preference tables, all text tables, `GenerativeUpscaleModel`, `FlipAxis`, and `PSLayerKind`.

Do not invent strings for typed DOM enums when a constant table exists. Action descriptors remain native JSON and may use their own string ids.
