import assert from "node:assert/strict";
import { test } from "node:test";

test("WebView UXP XMP exposes documented top-level class names as explicitly unsupported", async () => {
  const { uxp } = await import("../../dist/webview/index.js");
  const unsupported =
    /uxp\.xmp\..* is not supported by uxp-webview-bridge.*native UXP XMP objects and file access/;

  assert.equal(typeof uxp.xmp.XMPMeta, "function");
  assert.equal(typeof uxp.xmp.XMPFile, "function");
  assert.equal(typeof uxp.xmp.XMPDateTime, "function");
  assert.equal(typeof uxp.xmp.XMPIterator, "function");
  assert.equal(typeof uxp.xmp.XMPProperty, "function");
  assert.equal(typeof uxp.xmp.XMPFileInfo, "function");
  assert.equal(typeof uxp.xmp.XMPPacketInfo, "function");
  assert.equal(typeof uxp.xmp.XMPUtils.composeArrayItemPath, "function");

  assert.throws(() => new uxp.xmp.XMPMeta(), unsupported);
  assert.throws(() => uxp.xmp.XMPMeta.registerNamespace("urn:test", "test"), unsupported);
  assert.throws(() => uxp.xmp.XMPFile.getFormatInfo(0), unsupported);
  assert.throws(() => uxp.xmp.XMPUtils.composeArrayItemPath("urn:test", "items", 1), unsupported);
  assert.throws(() => uxp.xmp.XMPConst.NS_XMP, unsupported);
});
