# Refactor Plan: Excalidraw v0.18.0 integration + customization (web)

This plan is meant to be **the canonical checklist** for refactoring the `web/` integration to follow:
- `.github/instructions/excalidraw-v0.18.0.instructions.md`
- `research/excalidraw-integration.md`

It’s structured so we can stop/restart later and continue reliably.

---

## Goals
- Ensure **all Excalidraw API calls match v0.18.0 signatures** (no hidden breakage).
- Replace brittle UI hacks (CSS/DOM targeting) with **supported customization hooks**.
- Make import/hydration/serialization/export flows **correct, stable, and compatible**.
- Reduce `any`/unsafe mutations when interacting with Excalidraw types.

## Non-goals (for now)
- Adding collaboration / multi-user support.
- Overhauling the app UI/UX beyond what’s required for correctness and stability.
- Changing the Android/native bridge protocol unless required.

## Safety / invariants
- Do not invent Excalidraw APIs. Verify with:
  - Excalidraw v0.18.0 docs, and/or
  - installed package typings (preferred when available).
- Preserve saved scene compatibility: do not change persisted JSON format/envelope without explicit migration.

## Current hotspots (files likely to change)
- `web/src/App.tsx`
- `web/src/hooks/useSceneHydration.ts`
- `web/src/hooks/useNativeMessageHandlers.ts`
- `web/src/hooks/useSceneChangeSubscription.ts`
- `web/src/hooks/useNativePickers.ts`
- `web/src/hooks/useNativeFileHandles.ts`
- `web/src/components/SelectionPropertiesRail.tsx`
- `web/src/components/SelectionStyleFlyout.tsx`
- `web/src/index.css`

---

## Topic 0 — Baseline & guardrails

### Checklist
- [x] Create a “baseline behavior” note (what currently works in Web + Android)
- [x] Add a short “how to test manually” section (open/save/export/insert image)
- [x] Decide whether we will add a minimal automated smoke test (optional) — defer for now

### Baseline behavior (current)
- Browser: app loads, draws, serializes, and uses local fallback storage.
- Android WebView: open/save/export go through the native bridge (no Excalidraw built-in dialogs).

### Manual test checklist (quick)
- Browser
  - Draw a couple shapes, undo/redo feels sane.
  - Save (local fallback) then reload and confirm contents restored.
  - Insert an image, reload, confirm image still visible.
  - Export PNG/SVG (if enabled via host UI) still works.
- Android
  - Open a saved drawing from the picker and confirm it loads.
  - Save to document and confirm status reflects success/failure.
  - Export and confirm it lands in gallery.

### Acceptance
- We can reproduce the current flows before changing code.

---

## Topic 1 — Fix Excalidraw API signature mismatches (must-do)

### 1.1 `resetScene` misuse
**Problem:** Code calls `api.resetScene(scene, { resetLoadingState, replaceFiles })` but v0.18.0 `resetScene` only takes `{ resetLoadingState }`.

**Targets**
- `web/src/hooks/useSceneHydration.ts`
- `web/src/App.tsx`

### Checklist
- [x] Replace all `resetScene(scenePayload, ...)` uses with a v0.18.0 compliant pattern:
  - Prefer `initialData` for first-load (no imperative update on mount)
  - For runtime loads: `api.resetScene({ resetLoadingState: true })` + `api.updateScene(restoredScene)`
- [x] Remove `replaceFiles` usage (not in v0.18.0 API)
- [x] Confirm the loaded scene includes `files` when needed (images) (implemented via restore + `addFiles`)

### Acceptance
- Load/hydration works without console errors.
- Scene loads do not crash or silently ignore files.

### Notes
- When we touch hydration/import, we should likely also implement Topic 3 (restore utilities).

---

### 1.2 `addFiles` signature mismatch
**Problem:** Code uses `api.addFiles({ [fileId]: fileData })`, but v0.18.0 expects an array `addFiles(files: BinaryFileData[])`.

**Targets**
- `web/src/App.tsx` (image insertion)

### Checklist
- [x] Update `addFiles` usage to `api.addFiles([{ id, dataURL, mimeType, created, lastRetrieved }])`
- [x] Validate `fileId` on the image element matches the added file data
- [x] Verify inserting an image still persists/exports correctly (manual)

### Acceptance
- Insert image works in browser.
- Exported PNG/SVG still embeds/round-trips scene (as currently intended).

---

## Topic 2 — Replace brittle UI hacks with supported customization

### 2.1 Remove DOM/CSS-based menu hiding
**Problem:** `web/src/index.css` targets internal DOM labels/testids/classes.

**Targets**
- `web/src/index.css`
- `web/src/App.tsx`

### Checklist
- [x] Identify which Excalidraw UI pieces must be hidden/disabled (main menu, export dialogs, etc.)
- [x] Replace CSS hiding with supported configuration:
  - [x] Use `UIOptions` to disable/hide canvas actions (export, load, save, etc.)
  - [x] Optionally render an explicit `<MainMenu>` (empty or custom) if needed
  - [x] Optionally use `renderTopRightUI` for our host controls (if relevant) — not needed (host UI handled outside)
- [x] Remove (or greatly reduce) selectors in `index.css` that target Excalidraw internals

### Acceptance
- Default Excalidraw menu/export UI is not visible (as desired) without relying on brittle selectors.
- Upgrade to future Excalidraw versions becomes less risky.

---

### 2.2 Stop intercepting `openDialog.name` stringly-typed values
**Problem:** Hook relies on internal dialog IDs.

**Targets**
- `web/src/hooks/useSceneChangeSubscription.ts`

### Checklist
- [x] Disable native Excalidraw open/save/export UI via `UIOptions` instead of intercepting dialogs
- [x] Route open/save/export exclusively via the app’s own UI (ChromeOverlay)
- [x] Remove `openDialog` name checks entirely (or reduce to a last-resort guard only if unavoidable)

### Acceptance
- Open/save flows work without depending on `openDialog` internals.

---

## Topic 3 — Make scene load/import/hydration compatible (restore utilities)

### 3.1 Use restore utilities for imported scenes
**Problem:** `api.updateScene(parsed as any)` applies raw JSON without normalization.

**Targets**
- `web/src/hooks/useNativeMessageHandlers.ts`
- `web/src/App.tsx`
- `web/src/hooks/useSceneHydration.ts`

### Checklist
- [x] Decide the canonical import pipeline:
  - [x] Parse JSON
  - [x] Use `restore(...)` or `restoreElements/restoreAppState` (per v0.18.0 utilities)
  - [x] Apply via `api.updateScene({ elements, appState })` + `api.addFiles(Object.values(files))`
- [x] Ensure `objectsSnapModeEnabled` is enforced via `initialData`/controlled state, not re-entrant onChange updates
- [x] Prefer `initialData.scrollToContent` for first mount behavior where applicable

### Acceptance
- Loading older/newer `.excalidraw` scenes is more robust.
- No “double hydration” / redundant scene resets.

---

## Topic 4 — Undo/redo + update capture discipline

### 4.1 Introduce deliberate `captureUpdate`
**Problem:** Programmatic updates (hydration, zoom normalization, snap-mode enforcement) may pollute history or cause churn.

**Targets**
- `web/src/App.tsx` (zoom controls, load queue handling)
- `web/src/hooks/useSceneChangeSubscription.ts` (snap-mode)
- `web/src/hooks/useNativeMessageHandlers.ts` (load)

### Checklist
- [x] Import and use `CaptureUpdateAction` consistently
- [x] Mark hydration/import updates as `NEVER`
- [x] Mark multi-step user flows as `EVENTUALLY` if needed — not currently needed (no multi-step host edits)
- [x] Keep genuinely user-triggered changes as `IMMEDIATELY` (e.g., image insert)
- [x] Remove re-entrant `updateScene` calls inside `onChange` where possible

### Acceptance
- Undo history feels predictable (no weird “system changes” undo steps).
- Reduced unnecessary re-render/update churn.

---

## Topic 5 — Type safety + element mutation correctness

### 5.1 Reduce `any` and unsafe element writes
**Problem:** selection/style components cast to `any` and set fields that may not exist for every element.

**Targets**
- `web/src/components/SelectionPropertiesRail.tsx`
- `web/src/components/SelectionStyleFlyout.tsx`

### Checklist
- [x] Replace `any` casts with appropriate Excalidraw element subtypes or safe narrowing
- [x] Avoid writing unsupported fields on element types (e.g., roundness)
- [x] Ensure updates are immutable and preserve required invariants

### Acceptance
- Fewer `as any` casts.
- No runtime errors when selection includes mixed element types.

---

### 5.2 Stop manual “deep cloning” elements for duplication
**Problem:** duplication is implemented by copying elements and forcing `id/seed/version/versionNonce` which is fragile.

**Targets**
- `web/src/components/SelectionPropertiesRail.tsx`

### Checklist
- [x] Confirm whether Excalidraw exposes a supported duplication primitive; if not:
  - [x] Build duplication via Skeleton API (convert to elements) where possible
  - [x] Otherwise implement a carefully typed clone routine that updates only supported fields (fallback for unsupported types)
- [x] Keep selection state consistent after duplication (selects clones)

### Acceptance
- Duplicate selection works reliably and doesn’t corrupt element versions.

---

## Topic 6 — Recommended integration props / constants

### Checklist
- [x] Add `handleKeyboardGlobally={false}` unless we explicitly need global hotkeys
- [x] Replace string theme usage with constants (`THEME.LIGHT`, etc.)
- [x] Audit other “stringly typed” values and swap for exported constants where available

### Acceptance
- Host UI has fewer keybinding conflicts.
- Fewer upgrade footguns.

---

## Topic 7 — Cleanup / correctness nits

### Checklist
- [x] Revisit `includeDeleted` option in `useSceneSerialization` (doc says serialization omits deleted)
- [x] Replace `localStorage.clear()` with scoped key removal (only `diagrammer.*`) unless full wipe is intentional

### Acceptance
- Behavior is clearer and safer.

---

## Progress log (append-only)
- [x] 2025-12-25: Plan created.
- [x] 2025-12-25: Fixed Excalidraw v0.18.0 API mismatches (`resetScene` signature + `addFiles` array). Verified `npm run build`.
- [x] 2025-12-25: Removed `openDialog` interception and fixed strict TS issues (branded zoom/file types + selection rail typings). Verified `tsc --noEmit`.
- [x] 2025-12-25: Disabled Excalidraw built-in canvas actions (load/save/export) via `UIOptions`.
- [x] 2025-12-25: Added `restore()` pipeline for scene loads (startup + native/local runtime), including binary files via `addFiles`.
- [x] 2025-12-25: Added `captureUpdate` discipline (`NEVER` for programmatic updates; `IMMEDIATELY` for image insert).
- [x] 2025-12-25: Removed remaining string theme literals in scene defaults/restore overrides (use `THEME.LIGHT`).
- [x] 2025-12-25: Removed `as any` casts from selection/style flyouts; rely on Excalidraw element typings + `ROUNDNESS`.
- [x] 2025-12-25: Updated duplication to prefer `convertToExcalidrawElements({ regenerateIds: true })` with fallback for unsupported types.
- [x] 2025-12-25: Scoped native localStorage cleanup to `diagrammer.*` keys (avoid `localStorage.clear()`).
- [x] 2025-12-25: Removed misleading `includeDeleted` option from scene serialization (Excalidraw serializer omits deleted).
- [x] 2025-12-25: Removed remaining `as any` casts in web code (AppState interaction checks, scrollToContent targets, picker/file-handle shims, restore parsing).
- [x] 2025-12-25: Hardened native bridge payload boundary: native callbacks accept `unknown` and validate at the boundary; invalid payloads fail gracefully. Verified `tsc --noEmit` + `npm run build`.
- [x] 2025-12-25: Tightened scene JSON validation for native loads (must be record with `elements` array) and removed remaining `parsed: any` plumbing. Verified `tsc --noEmit` + `npm run build`.
- [x] 2025-12-25: Hardened `restoreSceneForApp()` input shaping to avoid blind property casts; malformed payloads restore safely. Verified `tsc --noEmit` + `npm run build`.
- [x] 2025-12-25: Added dev-only sanity check that image insert `fileId` exists in Excalidraw files after `addFiles()`.
- [x] 2025-12-25: Added Vite typing shim (`src/vite-env.d.ts`) so `import.meta.env` is typed in TS.
- [x] 2025-12-25: Manual validation: image insert round-trips (save/reload) and exports correctly.

## Implementation notes
- Keep changes small and staged topic-by-topic.
- After each topic, run:
  - `npm` build/dev sanity (manual test: open/save/load/export/insert image)
  - A quick pass in Android WebView if available (optional, but recommended)
