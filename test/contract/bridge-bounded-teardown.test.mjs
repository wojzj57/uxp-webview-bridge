import assert from "node:assert/strict";
import { test } from "node:test";

test("bounded session tombstones synchronously and attempts later owners after timeout", async () => {
  const { BoundedBridgeSession } = await import("../../dist/uxp/bounded-bridge-session.js");
  const events = [];
  const session = new BoundedBridgeSession({
    bridgeSessionId: "session-a",
    receive: () => events.push("receive"),
    revoke: () => events.push("revoke"),
    drain: () => new Promise(() => {}),
    owners: [
      { name: "early", cleanup: () => events.push("early") },
      { name: "late", cleanup: () => { events.push("late"); throw new Error("cleanup failed"); } }
    ],
    policy: { drainDeadlineMs: 5, ownerDeadlineMs: 5, totalDeadlineMs: 30 }
  });

  const closing = session.close("test");
  assert.equal(session.state, "closed");
  session.receive({});
  assert.deepEqual(events, ["revoke"]);
  await assert.rejects(closing, (error) => {
    assert.equal(error.code, "ERR_BRIDGE_SESSION_DRAIN_TIMEOUT");
    assert.deepEqual(error.failures.map(({ owner, disposition }) => [owner, disposition]), [
      ["in-flight-drain", "timed-out"],
      ["late", "rejected"]
    ]);
    return true;
  });
  assert.deepEqual(events, ["revoke", "late", "early"]);
});

test("timed-out owner is quarantined and its replacement remains fenced until late finalization", async () => {
  const { BoundedBridgeSession } = await import("../../dist/uxp/bounded-bridge-session.js");
  const { QuarantineManager } = await import("../../dist/uxp/quarantine-manager.js");
  const quarantine = new QuarantineManager();
  let release;
  const lateCleanup = new Promise((resolve) => { release = resolve; });
  const session = new BoundedBridgeSession({
    bridgeSessionId: "session-a",
    receive() {},
    revoke() {},
    drain() {},
    owners: [{
      name: "temporary-documents-a",
      kind: "photoshop.temporary-documents",
      replacementKey: "photoshop.temporary-documents",
      replacementPolicy: "blocked-until-finalized",
      cleanup: () => lateCleanup
    }],
    quarantineManager: quarantine,
    policy: { drainDeadlineMs: 5, ownerDeadlineMs: 5, totalDeadlineMs: 20 }
  });

  const closing = session.close("test");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(quarantine.snapshot()[0].disposition, "pending",
    "the cleanup owner remains pending before its deadline");
  assert.throws(
    () => quarantine.assertReplacementAllowed("photoshop.temporary-documents"),
    (error) => error.code === "ERR_BRIDGE_OWNER_QUARANTINED",
    "replacement must be fenced while cleanup is still inside its bounded deadline"
  );
  await assert.rejects(closing, /cleanup did not complete/);
  assert.equal(quarantine.snapshot()[0].bridgeSessionId, "session-a");
  assert.equal(quarantine.snapshot()[0].disposition, "timed-out");
  assert.throws(
    () => quarantine.assertReplacementAllowed("photoshop.temporary-documents"),
    (error) => error.code === "ERR_BRIDGE_OWNER_QUARANTINED"
  );
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.doesNotThrow(() => quarantine.assertReplacementAllowed("photoshop.temporary-documents"));
  assert.deepEqual(quarantine.snapshot(), []);
});
