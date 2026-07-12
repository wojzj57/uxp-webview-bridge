import assert from "node:assert/strict";
import { test } from "node:test";

// Contract tests run against the built dist. The batchPlay passthrough is a WebView-side seam: it
// forwards one RPC and returns the host's result array untouched (ADR 0010 / RFC-0009). These tests
// prove the seam without a real Photoshop host by driving `createPhotoshopNamespace` with a stub rpc.
const photoshopModule = "../../dist/webview/photoshop-api/modules/photoshop/photoshop.js";
const protocolModule = "../../dist/shared/photoshop-api/photoshop-protocol.js";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";

const PHOTOSHOP_MODULE = "photoshop-api/modules/photoshop";

/** A recording rpc that returns a caller-supplied result for the next call. */
function createRecordingRpc(result) {
  const calls = [];
  return {
    calls,
    call(module, method, args) {
      calls.push({ module, method, args });
      return Promise.resolve(result);
    }
  };
}

test("photoshop.action.batchPlay issues exactly one verbatim action.batchPlay RPC", async () => {
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const resultDescriptors = [{ _obj: "layer", layerID: 7 }];
  const rpc = createRecordingRpc(resultDescriptors);
  const photoshop = createPhotoshopNamespace(rpc);

  const commands = [{ _obj: "get", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }];
  const options = { synchronousExecution: false, modalBehavior: "execute" };

  const returned = await photoshop.action.batchPlay(commands, options);

  // Exactly one RPC, to the photoshop module, on the action.batchPlay method.
  assert.equal(rpc.calls.length, 1, "batchPlay should issue exactly one RPC.");
  const [call] = rpc.calls;
  assert.equal(call.module, PHOTOSHOP_MODULE, "batchPlay should target the photoshop module.");
  assert.equal(call.method, "action.batchPlay", "batchPlay should call the action.batchPlay method.");

  // Commands and options cross verbatim as [commands, options] — no transformation, no reference encode.
  assert.deepEqual(call.args, [commands, options], "batchPlay should forward [commands, options] verbatim.");

  // The host result array is returned unchanged (same contents; no decode pass).
  assert.deepEqual(returned, resultDescriptors, "batchPlay should return the host result array unchanged.");
});

test("photoshop.action.batchPlay omits the optional argument instead of transporting undefined", async () => {
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const rpc = createRecordingRpc([]);
  const photoshop = createPhotoshopNamespace(rpc);

  const commands = [{ _obj: "select", _target: [{ _ref: "document" }] }];
  await photoshop.action.batchPlay(commands);

  assert.equal(rpc.calls.length, 1, "batchPlay should issue exactly one RPC.");
  assert.deepEqual(rpc.calls[0].args, [commands], "omitted options should not become null in the UXP message channel.");
});

test("action.batchPlay is an accepted protocol method name", async () => {
  const { isPhotoshopProtocolMethodName, assertPhotoshopProtocolMethodName } = await import(protocolModule);
  assert.equal(isPhotoshopProtocolMethodName("action.batchPlay"), true, "action.batchPlay must be a known method.");
  assert.doesNotThrow(() => assertPhotoshopProtocolMethodName("action.batchPlay"));
});

test("photoshop.action utility methods issue one opaque RPC each", async () => {
  const { createPhotoshopNamespace } = await import(photoshopModule);
  const results = new Map([
    ["action.batchPlaySync", [{ _obj: "document", documentID: 7 }]],
    ["action.getIDFromString", 1234],
    ["action.recordAction", undefined],
    ["action.validateReference", true]
  ]);
  const calls = [];
  const photoshop = createPhotoshopNamespace({
    call(module, method, args) {
      calls.push({ module, method, args });
      return Promise.resolve(results.get(method));
    }
  });

  const commands = [{ _obj: "get", _target: [{ _ref: "document", _id: 7 }] }];
  const reference = [{ _ref: "document", _id: 7 }];
  const recordOptions = { name: "Bridge Test", methodName: "bridgeTestHandler" };
  const recordInfo = { source: "contract" };

  assert.deepEqual(await photoshop.action.batchPlaySync(commands), results.get("action.batchPlaySync"));
  assert.equal(await photoshop.action.getIDFromString("document"), 1234);
  await photoshop.action.recordAction(recordOptions, recordInfo);
  assert.equal(await photoshop.action.validateReference(reference), true);

  assert.deepEqual(calls, [
    { module: PHOTOSHOP_MODULE, method: "action.batchPlaySync", args: [commands] },
    { module: PHOTOSHOP_MODULE, method: "action.getIDFromString", args: ["document"] },
    { module: PHOTOSHOP_MODULE, method: "action.recordAction", args: [recordOptions, recordInfo] },
    { module: PHOTOSHOP_MODULE, method: "action.validateReference", args: [reference] }
  ]);
});

test("new action operations are accepted protocol method names", async () => {
  const { isPhotoshopProtocolMethodName } = await import(protocolModule);
  for (const method of [
    "action.batchPlaySync",
    "action.getIDFromString",
    "action.recordAction",
    "action.validateReference"
  ]) {
    assert.equal(isPhotoshopProtocolMethodName(method), true, `${method} must be a known method.`);
  }
});

test("host batchPlay supplies an empty options object for Photoshop's native binding", async () => {
  const { dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const received = [];
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return {
      action: {
        batchPlay(...args) {
          received.push(args);
          return Promise.resolve([]);
        }
      },
      core: {
        executeAsModal(fn) {
          return fn({});
        }
      }
    };
  };

  try {
    const commands = [{ _obj: "get" }];
    await dispatchPhotoshopCall("action.batchPlay", [commands]);
    assert.deepEqual(received, [[commands, {}]], "the native call must normalize omitted options to an object.");
  } finally {
    globalThis.require = originalRequire;
  }
});

test("host action utilities preserve native descriptors and modal boundaries", async () => {
  const { dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const calls = [];
  let modalCalls = 0;
  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return {
      action: {
        batchPlaySync(commands, options) {
          calls.push(["batchPlaySync", commands, options]);
          return [{ _obj: "document", documentID: 7 }];
        },
        getIDFromString(value) {
          calls.push(["getIDFromString", value]);
          return 1234;
        },
        recordAction(options, info) {
          calls.push(["recordAction", options, info]);
          return Promise.resolve();
        },
        validateReference(reference) {
          calls.push(["validateReference", reference]);
          return true;
        }
      },
      core: {
        executeAsModal(fn) {
          modalCalls += 1;
          return Promise.resolve(fn({}));
        }
      }
    };
  };

  try {
    const commands = [{ _obj: "get", _target: [{ _ref: "document", _id: 7 }] }];
    const reference = [{ _ref: "document", _id: 7 }];
    const recordOptions = { name: "Bridge Test", methodName: "bridgeTestHandler" };
    const recordInfo = { source: "contract" };

    assert.deepEqual(await dispatchPhotoshopCall("action.batchPlaySync", [commands]), [
      { _obj: "document", documentID: 7 }
    ]);
    assert.equal(dispatchPhotoshopCall("action.getIDFromString", ["document"]), 1234);
    await dispatchPhotoshopCall("action.recordAction", [recordOptions, recordInfo]);
    assert.equal(dispatchPhotoshopCall("action.validateReference", [reference]), true);

    assert.equal(modalCalls, 1, "only batchPlaySync should enter a modal scope.");
    assert.deepEqual(calls, [
      ["batchPlaySync", commands, {}],
      ["getIDFromString", "document"],
      ["recordAction", recordOptions, recordInfo],
      ["validateReference", reference]
    ]);
  } finally {
    globalThis.require = originalRequire;
  }
});

test("host batchPlaySync emulates removed native support through synchronousExecution", async () => {
  const { dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const received = [];
  globalThis.require = () => ({
    action: {
      batchPlay(commands, options) {
        received.push([commands, options]);
        return Promise.resolve([{ _obj: "document", documentID: 7 }]);
      }
    },
    core: {
      executeAsModal(fn) {
        return Promise.resolve(fn({}));
      }
    }
  });

  try {
    const commands = [{ _obj: "get", _target: [{ _ref: "document", _id: 7 }] }];
    const result = await dispatchPhotoshopCall("action.batchPlaySync", [
      commands,
      { dialogOptions: "silent", synchronousExecution: false }
    ]);

    assert.deepEqual(result, [{ _obj: "document", documentID: 7 }]);
    assert.deepEqual(received, [
      [commands, { dialogOptions: "silent", synchronousExecution: true }]
    ]);
  } finally {
    globalThis.require = originalRequire;
  }
});

test("host action utilities reject malformed inputs before native calls", async () => {
  const { dispatchPhotoshopCall } = await import(hostModule);

  assert.throws(
    () => dispatchPhotoshopCall("action.getIDFromString", [""]),
    /action\.getIDFromString value must be a non-empty string/
  );
  assert.throws(
    () => dispatchPhotoshopCall("action.validateReference", [null]),
    /action\.validateReference reference must be an object/
  );
  assert.throws(
    () => dispatchPhotoshopCall("action.recordAction", [{ name: "Missing method" }, {}]),
    /options\.methodName must be a non-empty string/
  );
});
