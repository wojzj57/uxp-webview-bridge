import assert from "node:assert/strict";
import { test } from "node:test";

test("HostRouter routes same-origin messages once by exact source", async () => {
  const { HostRouter } = await import("../../dist/uxp/host-router.js");
  const sourceA = { postMessage() {} };
  const sourceB = { postMessage() {} };
  const received = [];
  const listenerTarget = createListenerTarget();
  const router = new HostRouter({ listenerTarget });

  const bindingA = router.bind({
    webview: sourceA,
    allowedOrigins: ["https://same.example"],
    messageSourcePolicy: "required",
    receive: (message) => received.push(["A", message])
  });
  const bindingB = router.bind({
    webview: sourceB,
    allowedOrigins: ["https://same.example"],
    messageSourcePolicy: "required",
    receive: (message) => received.push(["B", message])
  });

  listenerTarget.dispatch({ source: sourceA, origin: "https://same.example", data: "one" });
  listenerTarget.dispatch({ source: sourceB, origin: "https://same.example", data: "two" });
  listenerTarget.dispatch({ source: {}, origin: "https://same.example", data: "unknown" });
  listenerTarget.dispatch({ source: sourceA, origin: "https://wrong.example", data: "wrong" });

  assert.deepEqual(received, [["A", "one"], ["B", "two"]]);
  assert.equal(listenerTarget.addCount, 1);
  await bindingA.destroy();
  assert.equal(listenerTarget.removeCount, 0);
  await bindingB.destroy();
  assert.equal(listenerTarget.removeCount, 1);
});

test("HostRouter rejects duplicate and legacy multi-binding configurations before side effects", async () => {
  const { HostRouter } = await import("../../dist/uxp/host-router.js");
  const source = { postMessage() {} };
  const listenerTarget = createListenerTarget();
  const router = new HostRouter({ listenerTarget });
  const binding = router.bind({
    webview: source,
    allowedOrigins: ["https://same.example"],
    messageSourcePolicy: "legacy-single-webview",
    receive() {}
  });

  assert.throws(
    () => router.bind({
      webview: source,
      allowedOrigins: ["https://same.example"],
      messageSourcePolicy: "required",
      receive() {}
    }),
    (error) => error?.code === "ERR_BRIDGE_DUPLICATE_WEBVIEW_BINDING"
  );
  assert.throws(
    () => router.bind({
      webview: { postMessage() {} },
      allowedOrigins: ["https://same.example"],
      messageSourcePolicy: "required",
      receive() {}
    }),
    (error) => error?.code === "ERR_BRIDGE_MESSAGE_SOURCE_REQUIRED"
  );
  await binding.destroy();
});

function createListenerTarget() {
  let listener;
  return {
    addCount: 0,
    removeCount: 0,
    addEventListener(type, next) {
      assert.equal(type, "message");
      this.addCount += 1;
      listener = next;
    },
    removeEventListener(type, next) {
      assert.equal(type, "message");
      assert.equal(next, listener);
      this.removeCount += 1;
      listener = undefined;
    },
    dispatch(event) {
      listener?.(event);
    }
  };
}
