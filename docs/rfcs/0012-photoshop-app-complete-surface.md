# RFC-0012: Photoshop application complete surface

Status: implemented
Source: `notes/reports/2026-07-13-photoshop-webview-coverage-review.md`, especially the `Photoshop -> PhotoshopApp` 3/18 finding
Related: RFC-0005, RFC-0006, RFC-0007, RFC-0008, RFC-0011; `notes/photoshop-module-spec.md`

## Summary

Raise the documented `photoshop.app` runtime surface from 3/18 members to 18/18 and implement the object families those members expose. The application object becomes a real persistent RemoteObject backed by `RemoteClass`, so application property writes use the same queued-write and read-your-writes semantics as Document and Layer. The batch also adds Documents, TextFont(s), Tool, Action/ActionSet, the complete Preferences family, and closes the two remaining SolidColor members.

This is one vertical Photoshop module slice across shared protocol, WebView declarations, UXP dispatch, serialization, and tests. It does not add a second setup API or move Photoshop implementation into shared/WebView code.

## Goals

1. Implement all 18 documented application members:
   - properties: `typename`, `preferences`, `displayDialogs`, `activeDocument`, `currentTool`, `actionTree`, `documents`, `foregroundColor`, `backgroundColor`, `fonts`
   - methods: `getColorProfiles`, `convertUnits`, `showAlert`, `batchPlay`, `bringToFront`, `open`, `createDocument`, `updateUI`
2. Preserve the existing asynchronous WebView contract: remote property reads return Promises and remote methods return Promises even when Adobe's UXP-side method is synchronous.
3. Preserve source compatibility for `PhotoshopApp`, while also exporting an exact-name `Photoshop` type alias.
4. Close the direct dependency types instead of returning untyped objects or placeholder namespaces.
5. Keep application and preference writes queued and flushed before a later read or method call.

## Non-goals

- Adobe's polyfill constructor slots (`Document`, `Layer`, `Action`, and similar) are not bridge members and are not recreated in the WebView.
- Undocumented/compatibility fields `currentDialogMode` and `validation` are not part of the 18-member coverage denominator and remain out of scope.
- `showAlert` is not invoked by unattended CDP tests because it would block automation.
- This RFC does not implement TextItem, CharacterStyle, ParagraphStyle, or WarpStyle; TextFont(s) is included only because it is a direct application dependency.
- No user document may be used as Photoshop fixture state.

## Module design

### 1. Photoshop application RemoteObject

`photoshop.app` is a persistent RemoteObject of remote type `"Photoshop"`. A new internal `Photoshop` class factory declares application properties and methods and delegates all communication to `RemoteClass`.

The WebView creates one deterministic synthetic application reference (`photoshop.app`) without an import-time RPC. Application reads/writes use `app.propertyGet`, `app.propertySet`, `app.batchGet`, and `app.batchSet`; methods use explicit `app.<method>` protocol names. The host validates that singleton reference, so repeated decoding preserves WebView identity.

This seam hides reference acquisition, write ordering, argument encoding, result decoding, and error propagation behind the existing `PhotoshopApp` interface. Callers continue to use `photoshop.app`; no factory is added.

Writable properties are `displayDialogs`, `activeDocument`, `foregroundColor`, and `backgroundColor`. Property descriptors and host whitelists are the source of truth. `activeDocument` and colors decode/encode RemoteReference or SolidColor envelopes rather than passing live objects.

### 2. Method behavior and modal policy

| Member | Host behavior | Modal policy |
| --- | --- | --- |
| `getColorProfiles` | validate optional mode and call native app | direct read |
| `convertUnits` | validate numbers/unit strings and call native app | direct read |
| `showAlert` | validate one string and await native app | direct UI call |
| `batchPlay` | pass descriptors/options unchanged | modal, matching existing action behavior |
| `bringToFront` | no arguments | direct UI call |
| `open` | resolve a UXP `File` reference (while retaining legacy path/options input) and serialize Document | modal document mutation |
| `createDocument` | validate `DocumentCreateOptions`, rebuild `fillColor`, serialize nullable Document | modal document mutation |
| `updateUI` | no arguments | direct call; do not create a nested modal scope |

Every dispatch path validates the protocol method and arguments before loading or touching `require("photoshop")`.

### 3. Documents collection

Upgrade `app.documents` from `readonly PsDocument[]` to a `Documents` snapshot collection. It exposes synchronous local `parent` and `typename`, plus async `getByName` and `add`. `add(options)` and `app.createDocument(options)` share one host validation/creation implementation. The existing snapshot and identity registries ensure members are the same `PsDocument` instances returned elsewhere.

The snapshot collection factory gains a declarative collection name so Documents, TextFonts, Layers, and later collections can expose `typename` without handwritten wrappers. This is a deliberate deepening of the collection module, not per-collection branching.

### 4. TextFont(s) and Tool

`TextFont` is a read-only persistent RemoteObject with `family`, `name`, `parent`, `postScriptName`, `style`, and `typename`. `TextFonts` is a snapshot collection with `parent`, `typename`, and `getByName`. Font identity is keyed by PostScript name, falling back to a stable object key only when the host does not provide one.

`Tool` is a RemoteObject with writable `id` and read-only `typename`. It uses a stable application-owned key because the current tool object represents application state rather than a disposable resource.

### 5. Action tree

`ActionSet` and `Action` are RemoteObjects, not opaque JSON. ActionSet declares `typename`, `index`, `id`, writable `name`, an `actions` snapshot, and `delete`, `duplicate`, `play`. Action declares `typename`, `id`, `index`, writable `name`, `parent`, and the same three methods where documented.

`app.actionTree` decodes to a snapshot of ActionSet references. Nested `ActionSet.actions` decodes to a snapshot of Action references. Native ids form stable registry keys. Mutating methods and name writes execute modally; property reads do not.

### 6. Preferences family

Implement exact-name remote interfaces/classes for:

- `Preferences`
- `PreferencesCursors`
- `PreferencesFileHandling`
- `PreferencesGeneral`
- `PreferencesGuidesGridsAndSlices`
- `PreferencesHistory`
- `PreferencesInterface`
- `PreferencesNotifications`
- `PreferencesPerformance`
- `PreferencesTools`
- `PreferencesTransparencyAndGamut`
- `PreferencesType`
- `PreferencesUnitsAndRulers`

The root Preferences object exposes `typename` and one reference property per category. Each category is a persistent RemoteObject with a descriptor table generated from one declarative preference definition. All documented scalar/enum properties are writable and use the standard queued write path. The host uses the same definition to validate readable/writable keys, avoiding duplicate allowlists.

Application preferences are global state, not resources. References are keyed by preference type and never require caller cleanup. The WebView namespace also exposes the documented direct preference values (`photoshop.preferences`, `photoshop.preferencesGeneral`, and peers) as aliases resolved from the same cached objects.

### 7. SolidColor completion

Keep SolidColor as a transport-safe value object. Add a WebView-local constructible `SolidColor` value class accepted anywhere `SolidColorInput` is accepted. It defaults to white, tracks the most recently accessed color model for transport, and exposes `nearestWebColor` and `isEqual`; equality compares normalized RGB values, which are serialized from Photoshop's own color conversion views. No handle, dispose call, or host identity is introduced.

`foregroundColor`, `backgroundColor`, and `DocumentCreateOptions.fillColor` all use the existing SolidColor encoder/host reconstruction path.

### 8. Types and constants

Add WebView-facing `DocumentCreateOptions` using the local runtime constant value unions and `SolidColorInput`. Export exact-name types for Photoshop, Documents, TextFont(s), Tool, Action/ActionSet, and Preferences while retaining existing `Ps*`/`PhotoshopApp` compatibility aliases where they already exist.

Use existing runtime constant tables. Any missing enum required by these signatures is transcribed into `photoshop-constants.ts` and checked against the local Adobe type snapshot.

## Protocol and result kinds

Add remote types for Photoshop, TextFont, Tool, ActionSet, Action, Preferences, and every Preferences category. Add result-kind declarations for:

- application references, values, and collections
- TextFont parent
- ActionSet actions and Action parent
- Preferences category references
- any method returning Document, ActionSet, or Action

Add explicit method families for application, documents, textFont/textFonts, tool, actionSet/action, and preferences. All names remain under `PHOTOSHOP_MODULE_ID` and are validated by `assertPhotoshopProtocolMethodName`.

## Files

Expected new WebView declarations live inside `src/webview/photoshop-api/modules/photoshop/`, with matching host handling in the existing symmetric UXP module. Small class families may share focused files (`preferences.ts`, `actions.ts`) because they belong to the single Photoshop module and use one declarative family definition; unrelated modules are not merged.

Primary changes:

- `src/shared/photoshop-api/photoshop-protocol.ts`
- `src/shared/photoshop-api/value-objects.ts`
- `src/shared/photoshop-api/photoshop-constants.ts` when an enum is missing
- `src/webview/photoshop-api/modules/photoshop/{photoshop,types,registry,collection}.ts`
- focused WebView class declaration files for app dependencies
- `src/uxp/photoshop-api/modules/photoshop/{host,types}.ts`
- module/public index type exports
- Photoshop contract and colocated CDP tests

## Verification

### Static and contract

- descriptor keys match declared application, action, font, tool, and preference members
- result-kind references resolve to registered types/value objects
- app setters queue and a later read/method waits for them
- Documents and TextFonts expose parent/typename and resolve stable members
- all host methods reject unsupported names/bad arguments before host access
- createDocument rebuilds SolidColor input and serializes null/Document correctly
- preference writes are modal/queued as designed and preserve remote errors
- SolidColor `nearestWebColor` and `isEqual` operate on normalized values

### CDP

- read safe application facts (`typename`, profiles, fonts, tool, preferences, action tree)
- create a uniquely named minimal document via `app.createDocument`, verify it appears in Documents/getByName, then close it without saving in `finally`
- verify foreground/background color read shapes without leaving changed global state
- verify `updateUI`; omit blocking `showAlert`
- skip version-gated members with diagnostics rather than failing unrelated cases

### Gates

Run `pnpm test:static`, `pnpm typecheck`, `pnpm test:contract`, `pnpm test`, `pnpm build`, `pnpm exec tsc -p tsconfig.cdp-webview.json`, and `pnpm test:uxp`. A development unit is not complete if required live Photoshop cases cannot run.

## Compatibility and migration

The public namespace remains `photoshop.app`. Existing reads of `activeDocument`, `documents`, and calls to `open` remain valid. `documents` becomes a richer readonly-array-compatible collection. Existing `PhotoshopApp` and `PsSolidColor` names remain exported; exact Adobe names are additive aliases or richer compatible interfaces. No deprecated setup/factory export is introduced.

## Worktree handling

The worktree already contains uncommitted Guide/Path changes that predate this RFC and overlap shared Photoshop files. They must be preserved. Review and commit must identify them as a separate logical unit or include them only when their own tests and scope are complete; this RFC does not authorize reverting them or silently folding unrelated behavior into the application commit.
