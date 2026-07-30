export default async function multiWebviewResourceIsolation({ target, bridge, assert, control, reportDiagnostics }) {
  const runtime = bridge.ensureConfigured();
  await runtime.ready;
  const sessionId = runtime.bridgeSessionId;
  const filePath = `plugin-data:/uxp-webview-bridge-rfc25-${target}-${Date.now()}.bin`;
  let fd;
  let imageData;
  let temporaryDocument;
  let document;
  let listenerDeliveries = 0;
  let listenerRegistered = false;
  let handedOffForHostTeardown = false;
  const listener = () => { listenerDeliveries += 1; };

  try {
    await bridge.fs.writeFile(filePath, Uint8Array.from([1, 2, 3, 4]));
    fd = await bridge.fs.open(filePath, "r+");
    imageData = await bridge.photoshop.imaging.createImageDataFromBuffer(
      new Uint8Array([target === "A" ? 11 : 21, 12, 13, 255]),
      { width: 1, height: 1, components: 4, colorSpace: "RGB" }
    );
    await bridge.photoshop.action.addNotificationListener(["make"], listener);
    listenerRegistered = true;
    temporaryDocument = await bridge.photoshop.core.createTemporaryDocument({});
    document = await bridge.photoshop.app.activeDocument;
    await waitFor(() => listenerDeliveries > 0, 2_000);
    const ready = await control("barrier", {
      name: "resource-owners-ready",
      value: { sessionId, filePath }
    });

    if (target === "A") {
      handedOffForHostTeardown = true;
      reportDiagnostics({ ownerPrepared: sessionId, resources: ["file-handle", "image", "document", "callback", "listener"] });
      return { target, bridgeSessionId: sessionId, ownerPrepared: true };
    }

    const peerClosed = await control("navigateTargetNoBridge", {
      target: "A",
      nonce: `resource-owner-close-${Date.now()}`
    });
    assert.equal(peerClosed.previousBridgeSessionId, ready.values.A.sessionId,
      "A navigation must close the Host session that owns A resources.");
    const buffer = new ArrayBuffer(4);
    const read = await bridge.fs.read(fd, buffer, 0, 4, 0);
    assert.equal(read.bytesRead, 4, "B descriptor must survive A teardown.");
    const pixels = await imageData.getData();
    assert.equal(pixels.byteLength, 4, "B image handle must survive A teardown.");
    assert.nonEmptyString(await document.name, "B document remote reference");
    assert.ok(ready.values.A.sessionId !== ready.values.B.sessionId, "Resource owners must use distinct sessions.");
    reportDiagnostics({
      liveOwner: sessionId,
      peerOwner: ready.values.A.sessionId,
      peerClosedByNavigation: true,
      resources: ["file-handle", "image", "document", "callback", "listener"]
    });
    await bridge.fs.unlink(ready.values.A.filePath);
    await bridge.photoshop.action.removeNotificationListener(["make"], listener);
    listenerRegistered = false;
    await bridge.photoshop.core.deleteTemporaryDocument(temporaryDocument);
    temporaryDocument = undefined;
    await imageData.dispose();
    imageData = undefined;
    await bridge.fs.close(fd);
    fd = undefined;
    await bridge.fs.unlink(filePath);
    await runtime.destroy();
    await control("awaitNativeResourceRelease");
    return {
      target,
      bridgeSessionId: sessionId,
      remainedLive: true,
      peerClosedByNavigation: true,
      resourcesVerified: 5
    };
  } finally {
    if (!handedOffForHostTeardown && runtime.state !== "destroyed") {
      if (listenerRegistered) try {
        await bridge.photoshop.action.removeNotificationListener(["make"], listener);
      } catch {}
      if (temporaryDocument) {
        try {
          await bridge.photoshop.core.deleteTemporaryDocument(temporaryDocument);
        } catch {}
      }
      if (imageData) {
        try {
          await imageData.dispose();
        } catch {}
      }
      if (fd !== undefined) {
        try {
          await bridge.fs.close(fd);
        } catch {}
      }
      try { await bridge.fs.unlink(filePath); } catch {}
    }
    if (!handedOffForHostTeardown && runtime.state !== "destroyed") await runtime.destroy();
  }
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Expected Photoshop listener callback was not delivered.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
