import assert from "node:assert/strict";
import { test } from "node:test";

test("protocol 0.3 requires Bridge session ownership after handshake", async () => {
  const protocol = await import("../../dist/shared/protocol.js");

  assert.equal(protocol.BRIDGE_PROTOCOL_VERSION, "0.3.0");
  assert.equal(
    protocol.isBridgeSessionEnvelope({
      type: "bridge.call",
      bridgeSessionId: "session-a",
      operationId: "operation-1",
      payload: { module: "os", method: "platform", args: [] }
    }),
    true
  );
  assert.equal(
    protocol.isBridgeSessionEnvelope({
      type: "bridge.call",
      sessionId: "ambiguous",
      operationId: "operation-1",
      payload: {}
    }),
    false
  );
});

test("nested modal context is complete or absent", async () => {
  const { isBridgeSessionEnvelope } = await import("../../dist/shared/protocol.js");
  const base = {
    type: "bridge.call",
    bridgeSessionId: "session-a",
    operationId: "operation-1",
    payload: { module: "photoshop", method: "app.get", args: [] }
  };

  assert.equal(
    isBridgeSessionEnvelope({
      ...base,
      modalContext: {
        modalSessionId: "modal-1",
        callbackInvocationId: "callback-1",
        parentOperationId: "operation-parent"
      }
    }),
    true
  );
  assert.equal(
    isBridgeSessionEnvelope({
      ...base,
      modalContext: { modalSessionId: "modal-1" }
    }),
    false
  );
});

test("remote handle registries fence equal ids by Bridge session before lookup", async () => {
  const { createRemoteHandleRegistry } = await import(
    "../../dist/uxp/uxp-api/remote/handle-registry.js"
  );
  const ownerA = createRemoteHandleRegistry({ bridgeSessionId: "session-a", now: () => 1 });
  const ownerB = createRemoteHandleRegistry({ bridgeSessionId: "session-b", now: () => 1 });
  const referenceA = ownerA.register("Document", { owner: "A" });
  const referenceB = ownerB.register("Document", { owner: "B" });

  assert.equal(referenceA.id, referenceB.id);
  assert.equal(referenceA.bridgeSessionId, "session-a");
  assert.equal(referenceB.bridgeSessionId, "session-b");
  assert.throws(
    () => ownerB.resolve(referenceA, "Document"),
    (error) => error?.code === "ERR_BRIDGE_STALE_REFERENCE"
  );
  assert.deepEqual(ownerB.resolve(referenceB, "Document"), { owner: "B" });
});
