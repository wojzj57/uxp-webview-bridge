export default async function modalOrdering({ target, bridge, assert, control, reportDiagnostics }) {
  const runtime = bridge.ensureConfigured();
  await runtime.ready;
  await control("barrier", { name: "modal-ready", value: runtime.bridgeSessionId });

  // A deliberately reaches the coordinator first so the cross-target FIFO order is observable.
  if (target === "B") await new Promise((resolve) => setTimeout(resolve, 30));
  const order = [];
  await bridge.photoshop.core.executeAsModal(async () => {
    order.push(`${target}:enter`);
    const tool = await bridge.photoshop.core.getActiveTool();
    assert.ok(tool && typeof tool === "object", "Nested read must carry invocation-scoped modal provenance.");
    if (target === "A") {
      const image = await bridge.photoshop.imaging.createImageDataFromBuffer(
        new Uint8Array([31, 32, 33, 255]),
        { width: 1, height: 1, components: 4, colorSpace: "RGB" }
      );
      await image.dispose();
    }
    await new Promise((resolve) => setTimeout(resolve, target === "A" ? 40 : 10));
    order.push(`${target}:exit`);
  }, { commandName: `Bridge RFC-0025 FIFO ${target}` });
  await control("barrier", { name: "modal-complete", value: order });

  let busyOutcome;
  if (target === "A") {
    await control("startExternalModalBusy", { durationMs: 150 });
    await control("armNativeBusyRejection", { target: "A" });
  }
  await control("barrier", { name: "external-modal-started", value: target });

  if (target === "A") {
    try {
      await bridge.photoshop.core.executeAsModal(
        async () => bridge.photoshop.core.getActiveTool(),
        { commandName: "Bridge RFC-0025 injected native busy no-retry" }
      );
      throw new Error("The injected native busy attempt unexpectedly succeeded.");
    } catch (error) {
      busyOutcome = {
        disposition: "native-rejected",
        name: error?.remoteName || error?.name,
        message: error?.remoteMessage || error?.message,
        code: error?.code,
        operationId: error?.operationId
      };
      assert.nonEmptyString(busyOutcome.operationId, "external busy operationId");
    }
  }

  const rejected = await control("barrier", { name: "external-busy-rejected", value: busyOutcome });
  busyOutcome = rejected.values.A;
  assert.equal(busyOutcome.disposition, "native-rejected", "Native busy must reject, not wait and retry.");
  if (target === "B") await control("awaitExternalModalBusy");
  await control("barrier", { name: "external-modal-complete", value: target });

  // A rejected head must release the queue so both targets can mutate afterward.
  await bridge.photoshop.core.executeAsModal(async () => bridge.photoshop.core.getActiveTool(), {
    commandName: `Bridge RFC-0025 post-busy ${target}`
  });
  await control("barrier", { name: "post-busy-complete", value: target });
  const snapshot = await control("snapshot");
  const busyAttempts = snapshot.modal.nativeAttempts.filter((entry) =>
    entry.operationId === busyOutcome.operationId
  );
  assert.equal(busyAttempts.length, 1, "A native busy request must enter the native boundary exactly once.");
  assert.equal(snapshot.modal.maxConcurrency, 1, "Bridge-owned modal work must never overlap.");
  assert.ok(snapshot.modal.nestedProvenance >= 2, "Nested calls must carry callback-scoped provenance.");
  assert.ok(snapshot.modal.externalBusy.some((entry) => entry.phase === "completed"),
    "The external-busy phase must complete before queue reuse.");

  const fifoStarts = snapshot.modal.queue
    .filter((entry) => entry.phase === "started" && /FIFO/.test(
      snapshot.modal.nativeAttempts.find((attempt) => attempt.operationId === entry.operationId)?.commandName || ""
    ));
  assert.equal(fifoStarts[0]?.target, "A", "Cross-target FIFO must start A first.");
  assert.equal(fifoStarts[1]?.target, "B", "Cross-target FIFO must start B second.");
  reportDiagnostics({ modal: snapshot.modal, busyOutcome });
  return { target, bridgeSessionId: runtime.bridgeSessionId, order, busyOutcome, modal: snapshot.modal };
}
