import assert from "node:assert/strict";
import { test } from "node:test";
const hostModule = "../../dist/uxp/photoshop-api/modules/photoshop/host.js";
function restore(value) { if (value === undefined) delete globalThis.require; else globalThis.require = value; }

test("Photoshop host bridges guides and nested path geometry", async () => {
  const { destroyPhotoshopHandles, dispatchPhotoshopCall } = await import(hostModule);
  const original = globalThis.require; const modal = []; const calls = [];
  const doc = { id: 7 }; const guide = { typename: "Guide", id: 1, docId: 7, parent: doc, direction: "vertical", coordinate: 10, delete() { calls.push("guide.delete"); } };
  const point = { typename: "PathPoint", anchor: [0, 0], kind: "cornerPoint", leftDirection: [0, 0], rightDirection: [0, 0] };
  const sub = { typename: "SubPathItem", operation: "add", closed: false, pathPoints: [point] }; point.parent = sub;
  const path = { typename: "PathItem", id: 3, docId: 7, parent: doc, kind: "normalPath", name: "P", subPathItems: [sub] }; sub.parent = path;
  for (const name of ["deselect", "fillPath", "makeClippingPath", "makeSelection", "remove", "select", "strokePath"]) path[name] = (...args) => calls.push([name, args]);
  path.duplicate = () => ({ ...path, id: 4, name: "P copy" });
  doc.guides = [guide]; doc.guides.add = (direction, coordinate) => ({ ...guide, id: 2, direction, coordinate }); doc.guides.removeAll = () => calls.push("guides.removeAll");
  doc.pathItems = [path]; doc.pathItems.add = (name, infos) => { calls.push(["pathItems.add", infos]); const added = { ...path, id: 5, name }; doc.pathItems.push(added); return added; }; doc.pathItems.removeAll = () => calls.push("pathItems.removeAll");
  class PathPointInfo {} class SubPathInfo {}
  globalThis.require = () => ({ app: { activeDocument: doc, documents: [doc], PathPointInfo, SubPathInfo, SolidColor: class { constructor() { this.rgb = {}; this.hsb = {}; this.cmyk = {}; this.lab = {}; this.gray = {}; } } }, action: {}, core: { async executeAsModal(fn, options) { modal.push(options.commandName); return fn({}); } } });
  try {
    const docRef = dispatchPhotoshopCall("app.activeDocument", []);
    const guides = dispatchPhotoshopCall("document.propertyGet", [docRef, "guides"]); assert.equal(guides.memberKind, "Guide");
    const guideRef = { kind: "uxp.remote.ref", type: "Guide", id: guides.memberIds[0] };
    assert.equal(dispatchPhotoshopCall("guide.propertyGet", [guideRef, "coordinate"]), 10);
    await dispatchPhotoshopCall("guide.propertySet", [guideRef, "coordinate", 20]); assert.equal(guide.coordinate, 20);
    assert.equal((await dispatchPhotoshopCall("guides.add", [docRef, "horizontal", 30])).type, "Guide");

    const paths = dispatchPhotoshopCall("document.propertyGet", [docRef, "pathItems"]); const pathRef = { kind: "uxp.remote.ref", type: "PathItem", id: paths.memberIds[0] };
    assert.deepEqual(dispatchPhotoshopCall("pathItems.getByName", [docRef, "P"]), pathRef);
    const subSnapshot = dispatchPhotoshopCall("pathItem.propertyGet", [pathRef, "subPathItems"]); const subRef = { kind: "uxp.remote.ref", type: "SubPathItem", id: subSnapshot.memberIds[0] };
    const points = dispatchPhotoshopCall("subPathItem.propertyGet", [subRef, "pathPoints"]); const pointRef = { kind: "uxp.remote.ref", type: "PathPoint", id: points.memberIds[0] };
    assert.deepEqual(dispatchPhotoshopCall("pathPoint.propertyGet", [pointRef, "anchor"]), [0, 0]);
    assert.deepEqual(dispatchPhotoshopCall("pathPoint.propertyGet", [pointRef, "parent"]), subRef);

    const added = await dispatchPhotoshopCall("pathItems.add", [docRef, "New", [{ closed: false, operation: "add", entireSubPath: [{ anchor: [1, 1], kind: "cornerPoint", leftDirection: [1, 1], rightDirection: [1, 1] }] }]]);
    assert.equal(added.type, "PathItem"); assert.ok(calls.find((entry) => Array.isArray(entry) && entry[0] === "pathItems.add")[1][0] instanceof SubPathInfo);
    for (const name of ["deselect", "duplicate", "fillPath", "makeClippingPath", "makeSelection", "remove", "select", "strokePath"]) await dispatchPhotoshopCall(`pathItem.${name}`, [pathRef]);
    assert.ok(modal.includes("guide.set.coordinate")); assert.ok(modal.includes("pathItems.add")); assert.ok(modal.includes("strokePath"));
  } finally { destroyPhotoshopHandles(); restore(original); }
});
