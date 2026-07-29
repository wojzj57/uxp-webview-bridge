# Photoshop unit values

Some layer transform methods accept a number or a structural unit value. Unit values are plain objects, not constructible exports:

```ts
await layer.translate(
  { _unit: "pixelsUnit", _value: 24 },
  { _unit: "percentUnit", _value: 10 }
);
await layer.rotate({ _unit: "angleUnit", _value: 45 });
```

Supported `_unit` strings include `angleUnit`, `densityUnit`, `distanceUnit`, `percentUnit`, `pixelsUnit`, `pointsUnit`, `millimetersUnit`, `centimetersUnit`, `inchesUnit`, and `picasUnit`. Use the exported TypeScript types such as `PixelValue`, `PercentValue`, and `AngleValue`; no RPC or disposal is associated with the value itself.
