import assert from "node:assert/strict";
import { test } from "node:test";

test("Bridge-owned modal requests are FIFO and an active lease survives owner cancellation", async () => {
  const { BridgeOwnedModalCoordinator } = await import(
    "../../dist/uxp/bridge-owned-modal-coordinator.js"
  );
  const coordinator = new BridgeOwnedModalCoordinator();
  const order = [];
  let releaseA;
  const activeA = new AbortController();
  const waitingB = new AbortController();

  const a = coordinator.run({
    bridgeSessionId: "session-a",
    operationId: "operation-a",
    signal: activeA.signal,
    execute: async () => {
      order.push("a:start");
      await new Promise((resolve) => { releaseA = resolve; });
      order.push("a:end");
      return "A";
    }
  });
  const b = coordinator.run({
    bridgeSessionId: "session-b",
    operationId: "operation-b",
    signal: waitingB.signal,
    execute: async () => {
      order.push("b:start");
      return "B";
    }
  });

  await tick();
  activeA.abort();
  coordinator.cancelWaiting("session-a");
  await tick();
  assert.deepEqual(order, ["a:start"]);
  assert.equal(coordinator.activeBridgeSessionId, "session-a");

  releaseA();
  assert.equal(await a, "A");
  assert.equal(await b, "B");
  assert.deepEqual(order, ["a:start", "a:end", "b:start"]);
  assert.equal(coordinator.activeBridgeSessionId, undefined);
});

test("external native rejection releases the FIFO head without retry", async () => {
  const { BridgeOwnedModalCoordinator } = await import(
    "../../dist/uxp/bridge-owned-modal-coordinator.js"
  );
  const coordinator = new BridgeOwnedModalCoordinator();
  let attempts = 0;
  const first = coordinator.run({
    bridgeSessionId: "session-a",
    operationId: "operation-a",
    signal: new AbortController().signal,
    execute: async () => {
      attempts += 1;
      throw new Error("external modal busy");
    }
  });
  const second = coordinator.run({
    bridgeSessionId: "session-b",
    operationId: "operation-b",
    signal: new AbortController().signal,
    execute: async () => "B"
  });

  await assert.rejects(first, /external modal busy/);
  assert.equal(await second, "B");
  assert.equal(attempts, 1);
});

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
