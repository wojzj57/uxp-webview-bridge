# `PsDocument`

Stable remote Photoshop document, usually from `photoshop.app.activeDocument`, `app.open`, or `documents.add`.

Read-only properties: `typename`, `id`, `saved`, `name`, `title`, `path`, `width`, `height`, `resolution`, `cloudDocument`, `cloudWorkAreaDirectory`, `histogram`, `mode`, `zoom`; collections/references for layers, artboards, background layer, channels, guides, paths, selection, history, samplers, count items, layer comps; `saveAs` helpers.

Writable queued properties: `pixelAspectRatio`, `quickMaskMode`, `bitsPerChannel`, `colorProfileName`, `colorProfileType`, `activeLayers`, `activeChannels`, `activeHistoryState`, `activeHistoryBrushSource`.

Document operations:

- Lifecycle/content: `duplicate`, `close`, `closeWithoutSaving`, `save`, `flatten`, `mergeVisibleLayers`, `revealAll`, `rasterizeAllLayers`.
- Geometry: `crop`, `resizeCanvas`, `resizeImage`, `trim`, `rotate`.
- Layers: create pixel/text/group/general layers, `groupLayers`, `duplicateLayers`, `linkLayers`, `paste`.
- Color/channels: `splitChannels`, `changeMode`, `convertProfile`, `trap`, `sampleColor`, `calculations`.
- AI/history: `generativeUpscale`, `suspendHistory(callback, name)`.
- Remote operations: `batchGet`, `batchSet`, `dispose`.

Key signatures:

```ts
duplicate(name?: string, mergeLayersOnly?: boolean): RemoteResult<PsDocument>;
close(saveOptions?: SaveOptionsValue): Promise<void>;
crop(bounds: ImagingBounds, angle?: number, width?: number, height?: number): Promise<void>;
resizeCanvas(width: number, height: number, anchor?: AnchorPositionValue): Promise<void>;
resizeImage(width?: number, height?: number, resolution?: number,
  resampleMethod?: ResampleMethodValue, amount?: number): Promise<void>;
trim(type: TrimTypeValue, top?: boolean, left?: boolean,
  bottom?: boolean, right?: boolean): Promise<void>;
createLayer(options?: { name?: string; opacity?: number; blendMode?: BlendModeValue }): RemoteResult<PsLayer | null>;
createPixelLayer(options?): RemoteResult<PsLayer | null>;
createTextLayer(options?): RemoteResult<PsLayer | null>;
createLayerGroup(options?): RemoteResult<PsLayer | null>;
groupLayers(layers: readonly PsLayer[]): RemoteResult<PsLayer | null>;
duplicateLayers(layers: readonly PsLayer[], target?: PsDocument): Promise<Layers>;
linkLayers(layers: readonly PsLayer[]): Promise<Layers>;
paste(intoSelection?: boolean): RemoteResult<PsLayer | null>;
changeMode(mode: ChangeModeValue, options?: BitmapConversionOptions | IndexedConversionOptions): Promise<void>;
convertProfile(profile: string, intent: IntentValue,
  blackPointCompensation?: boolean, dither?: boolean): Promise<void>;
sampleColor(position: { x: number; y: number }): Promise<SampledColor>;
calculations(options: CalculationsOptions): RemoteResult<PsDocument | PsChannel | undefined>;
generativeUpscale(model: GenerativeUpscaleModelValue, { scale }: { scale: number }): Promise<void>;
suspendHistory(callback: (context: SuspendHistoryContext) => void | Promise<void>,
  historyStateName: string): Promise<void>;
```

`close` accepts Adobe `SaveOptions`; options-object overloads are deprecated. Save-as methods require `UxpStorageFile`. Persistent documents normally need no routine disposal. Use `suspendHistory` to group a callback's nested calls in one document-scoped modal session.

`suspendHistory(callback, historyStateName)` requires a non-empty name and a callback returning `void | Promise<void>`; its callback result is not propagated. The callback receives `{ document, isCancelled, onCancel, reportProgress, hostControl }`. Await nested bridge calls. A callback throw/rejection rejects the outer call, while queued progress is flushed best-effort before the callback error remains authoritative.

Context signatures:

```ts
readonly isCancelled: boolean;
onCancel: ((event?: { reason: string }) => void | Promise<void>) | undefined;
reportProgress(options: { value?: number; commandName?: string }): void;
hostControl.suspendHistory({ documentID, name }): Promise<{ historySuspensionID: number }>;
hostControl.resumeHistory({ historySuspensionID, finalName? }, commit?: boolean): Promise<void>;
hostControl.registerAutoCloseDocument(documentID: number): Promise<void>;
hostControl.unregisterAutoCloseDocument(documentID: number): Promise<void>;
```

`reportProgress` queues work and is flushed by the bridge; the local type does not validate a numeric range. Observe both `isCancelled` and `onCancel`. Cancellation does not promise rollback of mutations already completed.

Although `dispose()` exists for protocol completeness, use it only when deliberately abandoning a document handle in a long-running workflow. Do not reuse the proxy afterward; ordinary documents/layers are designed to live until bridge teardown.

Related: [Documents](class-documents.md), [Layers](class-layers.md), [DocumentSaveAs](class-document-save-as.md), and [Photoshop unit values](photoshop-unit-values.md).
