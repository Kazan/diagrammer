# OSS customization analysis: how we “inject” new UI/components

This section is the part you asked for: the first-pass analysis of how this repo adds new UI (e.g., a lasso button) *without forking Excalidraw*, by composing components around the Excalidraw React component and driving it via the imperative API.

## The core injection pattern used here

The app doesn’t patch Excalidraw’s OSS source. Instead it:

1. Mounts Excalidraw as a child component.
2. Captures the Excalidraw imperative API via the `excalidrawAPI={(api) => ...}` prop.
3. Renders an overlay UI (custom toolbars, status, file chip) *outside* Excalidraw, positioned with CSS (`position: fixed` + `z-index`).
4. Translates overlay interactions into Excalidraw state by calling API methods like `setActiveTool()` and `updateScene()`.
5. Subscribes to Excalidraw changes via `api.onChange(...)` to keep overlay state in sync.

In this repo, those injection points are:

- Excalidraw mount + API capture: [web/src/App.tsx](web/src/App.tsx)
- Overlay composition: [web/src/components/ChromeOverlay.tsx](web/src/components/ChromeOverlay.tsx)
- Overlay tool UI: [web/src/components/CustomToolbar.tsx](web/src/components/CustomToolbar.tsx)
- Overlay styling/z-ordering: [web/src/index.css](web/src/index.css)
- Bidirectional state sync (Excalidraw → overlay): [web/src/hooks/useSceneChangeSubscription.ts](web/src/hooks/useSceneChangeSubscription.ts)

## “Injecting” a new tool button

### 1) Add a new tool to the overlay’s local union type

The overlay defines its own `ToolType` union (local to the app) instead of importing Excalidraw’s ToolType directly. This is a common customization move: it lets the UI express “virtual tools” (like `lasso`) even if the embedded library doesn’t expose them as real tools.

- Tool union + button list: [web/src/components/CustomToolbar.tsx](web/src/components/CustomToolbar.tsx)

### 2) Propagate tool selection up through the overlay

`CustomToolbar` is dumb/presentational. It calls `onSelect(toolId)`.

The `ChromeOverlay` passes that callback down from `App`:

- Overlay pass-through: [web/src/components/ChromeOverlay.tsx](web/src/components/ChromeOverlay.tsx)

### 3) Translate a UI selection into Excalidraw tool state

In `App`, `handleSelectTool` calls Excalidraw’s imperative API.

Important nuance: Excalidraw’s “selection” tool has submodes (rect vs lasso) controlled by appState preferences in newer builds; in older builds, lasso may not exist at all.

- Tool driver: [web/src/App.tsx](web/src/App.tsx)

## Keeping overlay and Excalidraw in sync

The overlay needs to reflect Excalidraw’s internal state (active tool, file name, dirty state, etc.). This is done by subscribing to `api.onChange`.

- Subscription logic: [web/src/hooks/useSceneChangeSubscription.ts](web/src/hooks/useSceneChangeSubscription.ts)

## The critical pitfall: writing appState incorrectly can blank the scene

This repo calls `api.updateScene({ appState: ... })` in a couple places.

In Excalidraw, `updateScene` merges, but passing an “incomplete” appState object (or one that accidentally drops fields) can cause behavior that looks like a reset/blank canvas. The safer pattern is:

- Read the current state via `api.getAppState()`
- Create a new object with a narrow change (`{ ...currentState, somePreference: ... }`)
- Call `updateScene` with only that `appState` patch

## Rule of thumb for future customizations

- **Overlay UI changes** (new buttons, panels, chips): cheap and safe—do them in your app code.
- **Behavior changes** that require editor internals (lasso, snapping, selection semantics): must be supported by the embedded Excalidraw build, or you’re in “fork/build from source” territory.
