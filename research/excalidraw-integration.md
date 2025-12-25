# Excalidraw integration in this repo

This document explains how the `web/` app embeds and integrates `@excalidraw/excalidraw` inside the Android WebView wrapper.

If you’re changing Excalidraw-facing code, also follow:
- `.github/instructions/excalidraw-v0.18.0.instructions.md`

## Where the integration lives

- `web/src/App.tsx` mounts Excalidraw and wires hooks.
- `web/src/hooks/useSceneHydration.ts` loads a startup scene and hydrates Excalidraw.
- `web/src/hooks/useSceneSerialization.ts` serializes the current scene (`serializeAsJSON`).
- `web/src/hooks/useNativeFileHandles.ts` provides a File System Access-ish `fileHandle` abstraction backed by the Android `NativeBridge`.
- `web/src/hooks/useSceneChangeSubscription.ts` subscribes to `excalidrawAPI.onChange(...)` to:
  - track dirty state
  - keep `objectsSnapModeEnabled` enabled
  - intercept Excalidraw’s open/save dialogs to use native pickers and native save flows
  - emit selection-change payloads for UI (bounds, viewport bounds)
- `web/src/hooks/useExportActions.ts` exports PNG/SVG using `exportToBlob` / `exportToSvg` and forwards data URLs to native.

## Persistence model

### Scene serialization
- The app uses `serializeAsJSON(elements, appState, files, source)` (from `@excalidraw/excalidraw`) to generate the canonical `.excalidraw` JSON payload.
- This repo wraps that JSON into an envelope (see `buildSceneSaveEnvelope(...)` in `web/src/scene-utils.ts`) before sending to native.

### Startup hydration
- On boot, `useSceneHydration.ts` attempts to load a stored scene from `window.NativeBridge.loadScene()`.
- If not present, it falls back to local storage keys.
- Hydration resets the Excalidraw scene and then scrolls to content if non-empty.

## Export model

- `useExportActions.ts` exports:
  - PNG via `exportToBlob({ mimeType: "image/png", ... })`
  - SVG via `exportToSvg({ ... })`
- The exported payload is embedded with scene data (`exportEmbedScene: true`) so assets can be round-tripped.
- Exports are forwarded to native as data URLs using `window.NativeBridge.exportPng(dataUrl)` / `exportSvg(dataUrl)`.

## Native bridge contract (high level)

- `window.NativeBridge` is present only in the Android WebView environment.
- In the browser (Vite dev server), the bridge is absent; code must guard calls.

Expected native methods (see root README for the canonical contract):
- `saveScene(json: string)` / `loadScene(): string | null`
- `exportPng(dataUrl: string)` / `exportSvg(dataUrl: string)`

## Practical rules when changing Excalidraw integration

- Prefer the `excalidrawAPI` callback prop (refs are not supported in Excalidraw >= 0.17).
- When changing the scene from code, be deliberate about undo/redo capture (`CaptureUpdateAction`).
- Don’t change the on-disk JSON format lightly; keep compatibility with existing saved scenes.
- Keep performance in mind: exports/restores can be expensive on tablets; avoid tight loops and prefer debouncing.
