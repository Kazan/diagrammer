# Diagrammer (offline Excalidraw on Android tablet)

Offline-first Android app embedding Excalidraw in a hardened WebView. Assets are served from `appassets.androidplatform.net` via `WebViewAssetLoader`; no network permission required.

## Project layout
- `app/src/main/java/com/example/diagrammerapp/MainActivity.kt` — Fullscreen WebView, immersive mode, WebView asset loader, JS bridge stubs, gallery picker hook.
- `app/src/main/assets/web/` — Place the built React bundle with `@excalidraw/excalidraw`. `index.html` is a placeholder.
- `app/src/main/res/layout/activity_main.xml` — Fullscreen WebView container.
- `app/src/main/res/values/themes.xml` — Immersive, no-action-bar theme for tablet.

## Build
1. Ensure Android SDK 34+ is installed and a local JDK 17 is available.
2. (Recommended) Regenerate Gradle wrapper: `gradle wrapper --gradle-version 8.5` (or newer). The wrapper JAR is not committed here.
3. Build: `./gradlew assembleDebug` (after wrapper regeneration) or `gradle assembleDebug` if you use a global Gradle install.
4. Install: `adb install -r app/build/outputs/apk/debug/app-debug.apk`.

## Adding Excalidraw bundle
1. Create a small React app that renders `<Excalidraw />` and imports `@excalidraw/excalidraw/index.css`.
2. Copy the build output (JS/CSS) plus fonts into `app/src/main/assets/web/`.
   - Set `window.EXCALIDRAW_ASSET_PATH = "/assets/web/"` (or "./") before loading Excalidraw so fonts are self-hosted.
   - Keep paths relative so `https://appassets.androidplatform.net/assets/web/index.html` can find them.
3. Wire JS to the native bridge methods exposed on `window.NativeBridge`: `saveScene(json)`, `loadScene()`, `exportPng(dataUrl)`, `exportSvg(dataUrl)`.
   - Implement `window.NativeBridgeCallbacks.onNativeMessage(payload)` in JS to get native success/error callbacks.

## JS ↔ native contract
- Native exposes `window.NativeBridge`:
  - `saveScene(json: string)` — writes to app-private storage (`filesDir/autosave.excalidraw.json`).
  - `loadScene(): string | null` — returns last saved scene JSON.
  - `exportPng(dataUrl)` / `exportSvg(dataUrl)` — expects data URLs; saves to `Pictures/Diagrammer/` via MediaStore.
- Native calls back to JS (if defined): `window.NativeBridgeCallbacks.onNativeMessage({ event, success, message? })` for save/export results.

## Gallery picker (no camera)
- `<input type="file" accept="image/*" multiple>` triggers the gallery picker via `WebChromeClient.onShowFileChooser`. Selected URIs are granted read permission and returned to the WebView.

## Offline and security notes
- No `INTERNET` permission; assets served from app package only.
- WebView restrictions: JS enabled, DOM storage on; file access from file URLs blocked; mixed content blocked by default; navigation locked to `appassets.androidplatform.net`.
- Safe Browsing enabled on API 26+; renderer death handled by recreating the activity.

## Next steps
- Replace the placeholder HTML with the actual Excalidraw bundle and fonts.
- Implement autosave cadence in JS; debounce writes before calling `NativeBridge.saveScene`.
- Add progress/error UI in JS based on `NativeBridgeCallbacks` messages.
