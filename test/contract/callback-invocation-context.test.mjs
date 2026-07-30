import assert from "node:assert/strict";
import { test } from "node:test";

test("callback invocation contexts serialize distinct modal owners and tombstone after settlement", async () => {
  const { CallbackInvocationContextCarrier } = await import(
    "../../dist/webview/callback-invocation-context.js"
  );
  const carrier = new CallbackInvocationContextCarrier();
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const seen = [];
  const firstContext = {
    modalSessionId: "modal-a",
    callbackInvocationId: "callback-a",
    parentOperationId: "operation-a"
  };
  const secondContext = {
    modalSessionId: "modal-b",
    callbackInvocationId: "callback-b",
    parentOperationId: "operation-b"
  };
  const first = carrier.run(firstContext, async () => {
    seen.push(carrier.current?.callbackInvocationId);
    await gate;
    seen.push(carrier.current?.callbackInvocationId);
  });
  const second = carrier.run(secondContext, async () => {
    seen.push(carrier.current?.callbackInvocationId);
  });
  await Promise.resolve();
  assert.deepEqual(seen, ["callback-a"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(seen, ["callback-a", "callback-a", "callback-b"]);
  assert.equal(carrier.current, undefined);
  carrier.invalidate();
  await assert.rejects(carrier.run(firstContext, () => undefined), (error) =>
    error.code === "ERR_BRIDGE_SESSION_CLOSED"
  );
});
