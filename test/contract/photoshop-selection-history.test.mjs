import assert from "node:assert/strict";
import { test } from "node:test";

const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";

function restoreRequire(originalRequire) {
  if (originalRequire === undefined) {
    delete globalThis.require;
  } else {
    globalThis.require = originalRequire;
  }
}

test("Photoshop host dispatches the complete Selection surface under modal execution", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const calls = [];
  const modalNames = [];
  const document = { id: 41 };
  document.duplicate = () => ({ id: 42 });
  const pathItem = { id: 9, docId: document.id };
  const selection = {
    typename: "Selection",
    docId: document.id,
    parent: document,
    bounds: { left: 1, right: 7, top: 2, bottom: 8, width: 6, height: 6 },
    solid: true
  };
  document.selection = selection;

  const methodNames = [
    "contract", "deselect", "expand", "feather", "grow", "inverse", "load", "makeWorkPath",
    "selectAll", "selectRectangle", "selectEllipse", "selectPolygon", "selectRow", "selectColumn",
    "save", "saveTo", "selectBorder", "smooth", "translateBoundary", "resizeBoundary", "rotateBoundary"
  ];
  for (const name of methodNames) {
    selection[name] = (...args) => {
      calls.push([name, args]);
      return name === "makeWorkPath" ? pathItem : undefined;
    };
  }

  globalThis.require = (moduleName) => {
    assert.equal(moduleName, "photoshop");
    return {
      app: { activeDocument: document, documents: [document] },
      action: {},
      core: {
        async executeAsModal(fn, options) {
          modalNames.push(options.commandName);
          return fn({});
        }
      }
    };
  };

  try {
    const documentRef = dispatchPhotoshopCall("app.activeDocument", []);
    const duplicateRef = await dispatchPhotoshopCall("document.duplicate", [documentRef, "Copy"]);
    assert.equal(duplicateRef.type, "Document");
    const selectionRef = dispatchPhotoshopCall("document.propertyGet", [documentRef, "selection"]);
    assert.equal(selectionRef.type, "Selection");
    assert.equal(
      dispatchPhotoshopCall("document.propertyGet", [documentRef, "selection"]).id,
      selectionRef.id,
      "Selection identity must be stable for its document."
    );

    const props = dispatchPhotoshopCall("selection.batchGet", [
      selectionRef,
      ["typename", "docId", "parent", "bounds", "solid"]
    ]);
    assert.equal(props.typename, "Selection");
    assert.equal(props.docId, document.id);
    assert.deepEqual(props.parent, documentRef);
    assert.equal(props.bounds.kind, "uxp.photoshop.value");
    assert.equal(props.bounds.valueKind, "ImagingBounds");
    assert.equal(props.solid, true);

    for (const name of methodNames) {
      const result = await dispatchPhotoshopCall(`selection.${name}`, [selectionRef, 3, false]);
      if (name === "makeWorkPath") {
        assert.equal(result.type, "PathItem");
      } else {
        assert.equal(result, undefined);
      }
    }
    assert.deepEqual(calls.map(([name]) => name), methodNames);
    assert.deepEqual(modalNames, ["duplicate", ...methodNames]);
    assert.throws(
      () => dispatchPhotoshopCall("selection.batchSet", [selectionRef, { solid: false }]),
      /Selection property is not writable: solid/
    );
  } finally {
    destroyPhotoshopHandles();
    restoreRequire(originalRequire);
  }
});

test("Photoshop host snapshots HistoryStates and decodes writable history references", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const originalRequire = globalThis.require;
  const modalNames = [];
  const document = { id: 73 };
  const state1 = { typename: "HistoryState", id: 1, docId: document.id, name: "Open", parent: document, snapshot: false };
  const state2 = { typename: "HistoryState", id: 2, docId: document.id, name: "Snapshot A", parent: document, snapshot: true };
  document.historyStates = [state1, state2];
  document.activeHistoryState = state2;
  document.activeHistoryBrushSource = state1;

  globalThis.require = () => ({
    app: { activeDocument: document, documents: [document] },
    action: {},
    core: {
      async executeAsModal(fn, options) {
        modalNames.push(options.commandName);
        return fn({});
      }
    }
  });

  try {
    const documentRef = dispatchPhotoshopCall("app.activeDocument", []);
    const snapshot = dispatchPhotoshopCall("historyStates.snapshot", [documentRef]);
    assert.equal(snapshot.kind, "uxp.photoshop.snapshot");
    assert.equal(snapshot.memberKind, "HistoryState");
    assert.deepEqual(snapshot.owner, documentRef);
    assert.equal(snapshot.memberIds.length, 2);

    const activeRef = dispatchPhotoshopCall("document.propertyGet", [documentRef, "activeHistoryState"]);
    const foundRef = dispatchPhotoshopCall("historyStates.getByName", [documentRef, "Snapshot A"]);
    assert.deepEqual(foundRef, activeRef, "collection lookup and property read must preserve identity.");
    assert.equal(dispatchPhotoshopCall("historyStates.getByName", [documentRef, "Missing"]), null);

    const props = dispatchPhotoshopCall("historyState.batchGet", [
      activeRef,
      ["typename", "id", "docId", "name", "parent", "snapshot"]
    ]);
    assert.deepEqual(props, {
      typename: "HistoryState",
      id: 2,
      docId: document.id,
      name: "Snapshot A",
      parent: documentRef,
      snapshot: true
    });

    const firstRef = dispatchPhotoshopCall("historyStates.getByName", [documentRef, "Open"]);
    await dispatchPhotoshopCall("document.propertySet", [documentRef, "activeHistoryState", firstRef]);
    assert.equal(document.activeHistoryState, state1);
    await dispatchPhotoshopCall("document.batchSet", [documentRef, { activeHistoryBrushSource: activeRef }]);
    assert.equal(document.activeHistoryBrushSource, state2);
    assert.deepEqual(modalNames, ["document.set.activeHistoryState", "document.batchSet"]);

    assert.throws(
      () => dispatchPhotoshopCall("historyState.batchSet", [activeRef, { name: "Nope" }]),
      /HistoryState property is not writable: name/
    );
  } finally {
    destroyPhotoshopHandles();
    restoreRequire(originalRequire);
  }
});
