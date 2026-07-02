import { createUnimplementedNamespace } from "../../../unimplemented-namespace.js";

export interface PhotoshopNamespace {
  readonly app: App;
  readonly core: Core;
  readonly action: Action;
  readonly imaging: Imaging;
  readonly constants: Record<string, unknown>;
}

export interface App {
  readonly activeDocument: Promise<Document>;
  readonly documents: Promise<Documents>;
}

export interface Core {
  executeAsModal<T>(
    callback: () => T | Promise<T>,
    options?: { readonly commandName?: string }
  ): Promise<T>;
}

export interface Action {
  batchPlay(commands: readonly unknown[], options?: Record<string, unknown>): Promise<unknown>;
}

export interface Imaging {
  getPixels(options: Record<string, unknown>): Promise<unknown>;
  createImageDataFromBuffer(buffer: ArrayBuffer | ArrayBufferView, options: Record<string, unknown>): Promise<unknown>;
}

export interface Document {
  readonly id: Promise<number>;
  readonly activeLayers: Promise<Layers>;
  readonly layers: Promise<Layers>;
  createLayer(...args: readonly unknown[]): Promise<Layer>;
  close(...args: readonly unknown[]): Promise<void>;
  closeWithoutSaving(): Promise<void>;
  flush(): Promise<void>;
}

export interface Layers {
  readonly length: Promise<number>;
  at(index: number): Promise<Layer>;
  toArray(): Promise<Layer[]>;
}

export interface Documents {
  readonly length: Promise<number>;
  at(index: number): Promise<Document>;
  toArray(): Promise<Document[]>;
}

export interface Layer {
  readonly id: Promise<number>;
  get name(): Promise<string>;
  set name(value: string);
  get visible(): Promise<boolean>;
  set visible(value: boolean);
  rotate(angle: number, anchor?: unknown): Promise<void>;
  scale(width: number, height: number, anchor?: unknown): Promise<void>;
  translate(deltaX: number, deltaY: number): Promise<void>;
  flush(): Promise<void>;
}

export const photoshop: PhotoshopNamespace = {
  app: createUnimplementedNamespace("photoshop.app"),
  core: createUnimplementedNamespace("photoshop.core"),
  action: createUnimplementedNamespace("photoshop.action"),
  imaging: createUnimplementedNamespace("photoshop.imaging"),
  constants: {}
};
