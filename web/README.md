# diagrammerapp-web

Minimal Vite + React scaffold that renders the Excalidraw component, built directly into the Android app assets.

## Requirements
- Node >= 18
- pnpm/yarn/npm (pick one)

## Install
```bash
cd web
npm install   # or yarn install / pnpm install
```

## Develop (browser)
```bash
npm run dev
```
Then open the dev URL (default http://localhost:5173). NativeBridge is not present in the browser; the status pill will show that.

## Build into the Android app assets
```bash
npm run build
```
This writes to `../app/src/main/assets/web` (the WebViewAssetLoader path), replacing the previous demo HTML.

## Preview the built bundle
```bash
npm run preview
```

## Notes
- The bundle sets `base: "/assets/web/"` so that static assets resolve correctly inside the WebView domain `https://appassets.androidplatform.net`.
- The App currently only renders an empty Excalidraw canvas and a NativeBridge status pill. You can augment it later to call `NativeBridge.saveScene`, `loadScene`, `exportPng`, `exportSvg`, etc.
