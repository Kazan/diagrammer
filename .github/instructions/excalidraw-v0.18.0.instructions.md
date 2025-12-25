---
description: Excalidraw v0.18.0 integration guidelines for this repo (web)
applyTo: 'web/src/**/*.ts, web/src/**/*.tsx, web/src/**/*.js, web/src/**/*.jsx, web/src/**/*.css'
---

# Excalidraw v0.18.0 ("@excalidraw/excalidraw") — Copilot Instructions

These instructions apply when editing or adding code that embeds Excalidraw, reads/writes `.excalidraw` scenes, exports images, customizes Excalidraw UI, or programmatically manipulates Excalidraw elements.

## Mandatory: verification-first (no hallucinations)

These rules override convenience and speed:

- Never guess Excalidraw APIs, prop names, types, or behaviors.
- Before using an Excalidraw API, you must confirm it exists in **v0.18.0** by checking either:
  - the upstream v0.18.0 docs (`dev-docs/docs/@excalidraw/excalidraw/api/`), or
  - the installed package types in the workspace (preferred for exact signatures).
- If you can’t confirm an API quickly, stop and fetch docs (Context7) or ask for clarification. Don’t proceed with speculative code.

**Scope/version**
- Target API: Excalidraw `@excalidraw/excalidraw` **v0.18.0**.
- Source of truth for this instruction set: upstream docs under `dev-docs/docs/@excalidraw/excalidraw/api/` at tag `v0.18.0`.

**Important**
- Prefer official Excalidraw v0.18.0 docs and the installed package types over any existing code in this repo.
- If existing code conflicts with upstream docs, assume the repo code may be outdated or workaround-y; propose changes that move the implementation toward the documented API.

## 1) Embedding model: prefer `excalidrawAPI` callback (refs removed)
- Do **not** rely on React refs to reach Excalidraw imperative APIs; ref support was removed in v0.17.0.
- Always acquire the imperative API via the `excalidrawAPI={(api) => ...}` prop and store it in component state or a ref.
- Treat `api` as nullable during initial render; gate all actions (`export`, `updateScene`, etc.) behind `if (!api) return`.

## 2) Controlled vs uncontrolled state
- Prefer initializing Excalidraw with `initialData` (object or promise) instead of calling imperative updates in the first paint.
- When controlling UI state via props (e.g., `theme`, `viewModeEnabled`, `zenModeEnabled`, `gridModeEnabled`), treat those props as the source of truth.
  - If `theme` is controlled and `UIOptions.canvasActions.toggleTheme` is enabled, propagate user changes back to the `theme` prop using `onChange` + app state observation.

### Props commonly relevant to host apps
- Prefer `handleKeyboardGlobally={false}` unless you explicitly need global hotkeys; it reduces collisions when multiple editors or other app UI exists.
- Leave `detectScroll={true}` unless you fully own offset recomputation (then call `api.refresh()` when needed).
- Use `onPaste(data, event)` to intercept paste; return `false` (or a promise resolving to `false`) to prevent Excalidraw’s default paste behavior.
- For link behavior:
  - Use `generateLinkForSelection(id, type)` to implement custom deep-links.
  - Use `onLinkOpen(element, event)` and call `event.preventDefault()` when you want to route internally.
- For embeddables:
  - Use `validateEmbeddable` to restrict/allow embed sources.
  - Use `renderEmbeddable` to replace the default `<iframe>` renderer.

## 3) `initialData`: what to pass and how
- `initialData` accepts `{ elements?, appState?, scrollToContent?, libraryItems?, files? }`.
- If `scrollToContent` is `false`, preserve scroll by passing `initialData.appState.scrollX` and `scrollY`.
- When supplying `libraryItems`, be prepared for promise-based loading.
- If you introduce host-app defaults (e.g., enforcing a specific `appState` flag), apply them consistently at initialization and during any subsequent resets.

## 4) Scene change handling and persistence
- Use `props.onChange(elements, appState, files)` for persistence triggers.
- Prefer `serializeAsJSON(elements, appState, files, source)` when saving scenes.
  - Excalidraw serialization omits deleted elements and strips many `AppState` fields.
  - If you need to override the exported `source` field, set `window.EXCALIDRAW_EXPORT_SOURCE`.
- When loading from a file/blob, use `loadFromBlob(blob, localAppState, localElements, fileHandle?)` or `loadSceneOrLibraryFromBlob(...)`.
  - If you pass `localAppState`, it takes precedence over blob-derived appState.

### Library utilities
- Use `serializeLibraryAsJSON(libraryItems)` when persisting libraries.
- Use `loadLibraryFromBlob(blob, defaultStatus)` to restore libraries.
- Use `mergeLibraryItems(localItems, otherItems)` to combine sets without duplicates.
- If supporting library-install flows (`#addLibrary` hash), use `parseLibraryTokensFromUrl()` and/or `useHandleLibrary({ excalidrawAPI, getInitialLibraryItems? })`.

### i18n utilities
- Prefer `langCode` prop (one of `languages`) to set UI language.
- If rendering custom UI inside Excalidraw, use `useI18n()` within Excalidraw children to translate your labels.

## 5) Imperative API usage (`excalidrawAPI`)
Use the imperative API for user-triggered actions and external integrations.

### 5.1 `updateScene(sceneData)` and undo/redo capture
- Use `updateScene({ elements?, appState?, collaborators?, captureUpdate? })` for partial updates.
- Choose `captureUpdate` intentionally:
  - `CaptureUpdateAction.IMMEDIATELY`: most local, user-driven updates.
  - `CaptureUpdateAction.EVENTUALLY`: multi-step async flows (avoid capturing each intermediate step).
  - `CaptureUpdateAction.NEVER`: remote/collab updates, hydration, or initialization (avoid polluting undo/redo).
- **Note**: some changes are not observed by the store/history (e.g., collaborators map or unobserved appState parts) and will not be undoable regardless.

### 5.2 Element and state reads
- Prefer `api.getSceneElements()` (non-deleted) for exports and UI computations.
- Use `api.getSceneElementsIncludingDeleted()` only when you explicitly need tombstones.
- Use `api.getAppState()` for the current UI state.
- Use `api.getFiles()` to retrieve binary file cache; it may include unreferenced files, so compare against elements before persisting.

### 5.3 Navigation and layout
- Use `api.scrollToContent(target?, opts?)` to center/fit content.
- Call `api.refresh()` only when Excalidraw’s container position changes due to non-window scrolling or other unusual layout shifts.

### 5.4 UX utilities
- Use `api.setToast({ message, closable?, duration? } | null)` for transient feedback.
- Use `api.setActiveTool(...)` to switch tools from external UI.
- If customizing sidebars, use `api.toggleSidebar({ name, tab?, force? })` or `<Sidebar.Trigger/>`.

### 5.5 Event subscriptions
- Prefer `api.onChange(...)` (returns an unsubscribe) when you need to observe changes outside React re-render timing.
- Use `api.onPointerDown(...)` / `api.onPointerUp(...)` for canvas-level pointer hooks.

## 6) Programmatic element creation: use Skeleton API
- If you generate elements programmatically, prefer the **Skeleton API** and `convertToExcalidrawElements(skeleton, { regenerateIds? })`.
- Only pass fully qualified `ExcalidrawElement[]` to `initialData`/`updateScene`; the skeleton must be converted first.
- The Skeleton API is marked beta in upstream docs; keep usage isolated and easy to adjust.

### 6.1 Custom element metadata
- Store app-specific metadata in `element.customData` (`Record<string, any>`).
- Avoid mutating elements in-place; create new element objects when applying updates.

## 7) UI customization

### 7.1 Children components (`<Excalidraw>...</Excalidraw>`)
Use children components to customize supported regions of Excalidraw UI.

- `<MainMenu>`: if rendered, you must populate items; otherwise Excalidraw renders the default main menu.
  - Prefer `MainMenu.Item`, `MainMenu.ItemLink`, `MainMenu.ItemCustom`, `MainMenu.Group`.
  - You can embed default items via `MainMenu.DefaultItems.*`.
  - Call `event.preventDefault()` in `onSelect` to keep the menu open.

- `<Footer>`: custom footer renders on **desktop** when placed as a direct child of `<Excalidraw>`.
  - For **mobile**, render the footer content inside `<MainMenu>` and gate it using `useDevice().editor.isMobile`.

- `<Sidebar name="...">`: add custom sidebars.
  - `name` must be unique.
  - Docking is controlled via `docked` + `onDock`; Excalidraw does not manage docked state for you.
  - Control docking breakpoint using `UIOptions.dockedSidebarBreakpoint`.

- `<WelcomeScreen>`: render default or customized welcome UI when canvas is empty.

- `<LiveCollaborationTrigger>`: use for a collab button; you must supply `onSelect` and keep `appState.collaborators` updated (e.g., via `updateScene({ collaborators })`).

### 7.2 Render props
- Use `renderTopRightUI(isMobile, appState)` to render top-right controls.
- Use `renderCustomStats()` to add items to the nerd stats dialog.
- Use `renderEmbeddable(element, appState)` to override embeddable renderer (iframe replacement).

### 7.3 UIOptions
- Use `UIOptions` to hide or customize canvas actions.
  - `UIOptions.canvasActions.export` can be `false` or an options object (e.g., `saveFileToDisk`, `onExportToBackend`, `renderCustomUI`).
- Use `UIOptions.tools` to control tool visibility (notably `image`).
- Use `UIOptions.welcomeScreen` to enable/disable the welcome screen behavior.

## 8) Export utilities
- Prefer exporting via the official utilities:
  - `exportToBlob({ elements, appState, files, ... })`
  - `exportToSvg({ elements, appState, files, exportPadding?, metadata? })`
  - `exportToCanvas({ elements, appState, files, getDimensions | maxWidthOrHeight, exportPadding? })`
  - `exportToClipboard({ ..., type: 'png' | 'svg' | 'json' })`
- For export behavior, set export-related appState fields (exportBackground, exportWithDarkMode, exportEmbedScene, viewBackgroundColor).


## 9) Restore utilities
- When importing or hydrating scenes, normalize data:
  - `restoreAppState(importedAppState, localAppState)`
  - `restoreElements(importedElements, localElements, opts?)`
  - `restore(importedDataState, localAppState, localElements, opts?)`
  - `restoreLibraryItems(libraryItems, defaultStatus)`
- Use `localElements` when importing into an existing scene where element versions matter.
- For high-frequency restore loops (e.g., collab), consider `opts.refreshDimensions=false` for performance.

## 10) Constants to use (avoid stringly-typed values)
- Prefer exported constants over raw strings:
  - `THEME.{LIGHT,DARK}`
  - `FONT_FAMILY` (e.g., default Excalifont)
  - `MIME_TYPES` (scene vs library mime types)

## 11) Integration safety (recommended)
- Treat exported `.excalidraw` JSON as a compatibility surface: avoid inventing non-standard scene formats; store app-specific metadata using `element.customData`.
- Avoid blocking the UI thread with heavy exports/restores; debounce or schedule work when iterating over large element arrays.
- Avoid `any` when interacting with Excalidraw types; prefer imports from:
  - `@excalidraw/excalidraw/types`
  - `@excalidraw/excalidraw/element/types`
- If you discover mismatches between local package types and documentation, follow the installed types and re-check the upstream v0.18.0 docs for the intended behavior.
