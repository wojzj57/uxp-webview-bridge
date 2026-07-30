import assert from "node:assert/strict";
import { test } from "node:test";

test("generation-bound handshake confirms one session before business dispatch", async () => {
  const { GenerationBoundHostBinding } = await import("../../dist/uxp/host-binding.js");
  const posted = [];
  const received = [];
  const closed = [];
  const binding = new GenerationBoundHostBinding({
    bindingId: "binding-a",
    webview: { postMessage: (message) => posted.push(message) },
    capabilities: ["os"],
    createSession: ({ bridgeSessionId }) => ({
      receive: (message) => received.push(message),
      close: (reason) => closed.push([bridgeSessionId, reason])
    })
  });

  binding.receive({
    type: "bridge.hello",
    protocolVersion: "0.3.4",
    clientVersion: "1.0.0",
    clientInstanceId: "client-a"
  });
  const challenge = posted.at(-1);
  assert.equal(challenge.type, "bridge.handshake.challenge");

  binding.receive({
    type: "bridge.handshake.ack",
    clientInstanceId: "client-a",
    candidateId: challenge.candidateId,
    documentGeneration: challenge.documentGeneration,
    challenge: challenge.challenge
  });
  await tick();
  const ready = posted.at(-1);
  assert.equal(ready.type, "bridge.ready");
  assert.equal(ready.protocolVersion, "0.3.0");

  binding.receive({
    type: "bridge.ready.ack",
    clientInstanceId: "client-a",
    candidateId: ready.candidateId,
    documentGeneration: ready.documentGeneration,
    bridgeSessionId: ready.bridgeSessionId,
    readyNonce: ready.readyNonce
  });
  const established = posted.at(-1);
  assert.equal(established.type, "bridge.established");
  assert.equal(binding.state, "handshaking");

  binding.receive({
    type: "bridge.session.confirm",
    bridgeSessionId: ready.bridgeSessionId,
    clientInstanceId: "client-a",
    documentGeneration: ready.documentGeneration
  });
  assert.equal(binding.state, "ready");

  const call = {
    type: "bridge.call",
    bridgeSessionId: ready.bridgeSessionId,
    operationId: "same-operation-id",
    payload: { module: "os", method: "platform", args: [] }
  };
  binding.receive(call);
  assert.deepEqual(received, [call]);
  assert.deepEqual(closed, []);
  await binding.destroy();
});

test("protocol mismatch and same-generation client conflict create no second owner", async () => {
  const { GenerationBoundHostBinding } = await import("../../dist/uxp/host-binding.js");
  const posted = [];
  let factoryCalls = 0;
  const binding = new GenerationBoundHostBinding({
    bindingId: "binding-a",
    webview: { postMessage: (message) => posted.push(message) },
    capabilities: [],
    createSession: () => {
      factoryCalls += 1;
      return { receive() {}, close() {} };
    }
  });

  binding.receive({
    type: "bridge.hello",
    protocolVersion: "0.2.0",
    clientVersion: "1.0.0",
    clientInstanceId: "old"
  });
  assert.equal(posted.at(-1).error.code, "ERR_BRIDGE_PROTOCOL_VERSION_MISMATCH");
  assert.equal(factoryCalls, 0);
  await binding.destroy();
});

test("compatible competing client cannot replace a committed same-generation session", async () => {
  const { GenerationBoundHostBinding } = await import("../../dist/uxp/host-binding.js");
  const posted = [];
  let factoryCalls = 0;
  const binding = new GenerationBoundHostBinding({
    bindingId: "binding-conflict",
    webview: { postMessage: (message) => posted.push(message) },
    capabilities: [],
    createSession: () => {
      factoryCalls += 1;
      return { receive() {}, close() {} };
    }
  });

  await establish(binding, posted, "client-owner");
  assert.equal(binding.state, "ready");
  binding.receive(hello("client-competitor"));
  assert.equal(posted.at(-1).type, "bridge.handshake.error");
  assert.equal(posted.at(-1).error.code, "ERR_BRIDGE_GENERATION_CONFLICT");
  assert.equal(factoryCalls, 1);
  assert.equal(binding.state, "ready");
  await binding.destroy();
});

test("load barriers revoke the old generation and defer the replacement handshake", async () => {
  const { GenerationBoundHostBinding } = await import("../../dist/uxp/host-binding.js");
  const posted = [];
  const closed = [];
  const binding = new GenerationBoundHostBinding({
    bindingId: "binding-generation",
    webview: { postMessage: (message) => posted.push(message) },
    capabilities: [],
    generationMode: "load-barrier",
    createSession: ({ bridgeSessionId, documentGeneration }) => ({
      receive() {},
      close: (reason) => closed.push([bridgeSessionId, documentGeneration, reason])
    })
  });

  const firstReady = await establish(binding, posted, "client-first");
  assert.equal(firstReady.navigationReplacement, "supported");
  assert.equal(firstReady.documentGenerationMode, "load-barrier");

  binding.beginDocumentGeneration();
  assert.equal(binding.state, "waiting");
  assert.equal(closed.length, 1);
  binding.receive(hello("client-second"));
  assert.equal(posted.at(-1).type, "bridge.established");

  binding.completeDocumentGeneration();
  const replacementChallenge = posted.at(-1);
  assert.equal(replacementChallenge.type, "bridge.handshake.challenge");
  assert.equal(replacementChallenge.documentGeneration, 1);
  await binding.destroy();
});

async function establish(binding, posted, clientInstanceId) {
  binding.receive(hello(clientInstanceId));
  const challenge = posted.at(-1);
  binding.receive({
    type: "bridge.handshake.ack",
    clientInstanceId,
    candidateId: challenge.candidateId,
    documentGeneration: challenge.documentGeneration,
    challenge: challenge.challenge
  });
  await tick();
  const ready = posted.at(-1);
  binding.receive({
    type: "bridge.ready.ack",
    clientInstanceId,
    candidateId: ready.candidateId,
    documentGeneration: ready.documentGeneration,
    bridgeSessionId: ready.bridgeSessionId,
    readyNonce: ready.readyNonce
  });
  binding.receive({
    type: "bridge.session.confirm",
    bridgeSessionId: ready.bridgeSessionId,
    clientInstanceId,
    documentGeneration: ready.documentGeneration
  });
  return ready;
}

function hello(clientInstanceId) {
  return {
    type: "bridge.hello",
    protocolVersion: "0.3.4",
    clientVersion: "1.0.0",
    clientInstanceId
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
