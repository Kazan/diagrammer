# Diagrammer

Offline-first Android tablet app embedding [Excalidraw](https://excalidraw.com) in a hardened WebView. Assets are served from `appassets.androidplatform.net` via `WebViewAssetLoader`; no network permission required.

## Features

- **Fully offline** — No `INTERNET` permission; all assets bundled in APK
- **Excalidraw v0.18.0** — Full drawing canvas with shapes, arrows, text, freehand
- **Document persistence** — Save/open `.excalidraw` files via Android document picker
- **Export** — PNG and SVG export to device gallery (`Pictures/Diagrammer/`)
- **E-ink optimized** — Detects Boox/Onyx/Kindle devices and applies flat UI
- **Selection properties panel** — Quick access to stroke, fill, opacity, font settings
- **Undo/redo** — Full history with keyboard shortcuts
- **Zoom controls** — Fit, reset, and percentage-based zoom

## Project Layout

```
├── app/                          # Android app (Kotlin)
│   └── src/main/
│       ├── java/.../
│       │   ├── MainActivity.kt   # WebView setup, immersive mode, file pickers
│       │   └── NativeBridge.kt   # JS↔Native bridge (save/load/export)
│       ├── assets/web/           # Built web bundle (generated)
│       └── res/                  # Android resources
├── web/                          # React + Vite + Excalidraw
│   ├── src/
│   │   ├── App.tsx               # Main component, state management
│   │   ├── components/           # UI components (TopBar, SelectionRail, etc.)
│   │   ├── hooks/                # Custom hooks (export, serialization, etc.)
│   │   ├── native-bridge.ts      # TypeScript interface to NativeBridge
│   │   └── excalidraw-*.ts       # Excalidraw utilities (restore, z-index)
│   └── vite.config.ts            # Build config (outputs to app/assets/web/)
├── research/                     # Architecture docs and notes
├── .github/
│   ├── instructions/             # Copilot coding guidelines
│   └── skills/                   # AI skill definitions
└── Makefile                      # Build automation
```

## Requirements

- **Android SDK 34+** with JDK 17
- **Node.js 18+** for web build
- **Gradle 8.9+** (wrapper included)

## Quick Start

```bash
# Install web dependencies and build
make deps

# Build and install debug APK to connected device
make run

# Or build release APK (requires keystore, see below)
make apk
```

### Development

```bash
# Run web dev server (browser testing)
make web
# Opens http://localhost:5173/assets/web/

# Watch Android logs
make logs
```

## Architecture

### Web Layer (React + Excalidraw)

The web app renders Excalidraw with custom chrome:

- **TopBar** — File status, save/open/new/export actions
- **SelectionPropertiesRail** — Context-aware property editor for selected elements
- **ChromeOverlay** — Status messages, zoom controls

Key hooks:
- `useExportActions` — PNG/SVG export with metrics logging
- `useSceneSerialization` — Scene JSON with SHA-256 integrity
- `useNativeFileHandles` — File handle shim for native integration
- `useSceneHydration` — Restore scenes on load

### Native Bridge (Kotlin ↔ JavaScript)

The bridge is injected as `window.NativeBridge`:

| Method | Description |
|--------|-------------|
| `persistSceneToDocument(envelope)` | Save scene with integrity envelope |
| `saveSceneToCurrentDocument()` | Save to last-opened document |
| `openSceneFromDocument()` | Open document picker |
| `exportPng(dataUrl)` | Export PNG to gallery |
| `exportSvg(dataUrl)` | Export SVG to gallery |
| `getCurrentFileName()` | Get current document name |

Callbacks are delivered via `window.NativeBridgeCallbacks.onNativeMessage(payload)`.

### Scene Envelope Format

Scenes are wrapped in an integrity envelope for safe persistence:

```typescript
{
  json: string,           // Excalidraw scene JSON
  byteLength: number,     // Expected byte count
  sha256: string | null,  // Content hash (when crypto available)
  suggestedName: string,  // Display name
  createdAt: number       // Timestamp
}
```

## Release Build

1. Create keystore:
   ```bash
   mkdir -p keystore
   keytool -genkeypair -v -keystore keystore/release.keystore \
     -alias diagrammer -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Configure `keystore/keystore.properties`:
   ```properties
   storeFile=../keystore/release.keystore
   storePassword=your_password
   keyAlias=diagrammer
   keyPassword=your_password
   ```

3. Build:
   ```bash
   make apk
   # Output: app/build/outputs/apk/release/app-release.apk
   ```

## E-ink Device Support

The app detects e-ink devices (Boox, Onyx, Kindle, Kobo, PocketBook, reMarkable) and applies:
- Disables backdrop blur effects for GPU performance
- UI is already flat (no shadows) globally

## Security

- No network permissions
- WebView hardened: JS enabled, DOM storage on; file URLs blocked; mixed content blocked
- Navigation locked to `appassets.androidplatform.net`
- Safe Browsing enabled on API 26+
- Renderer death triggers activity recreation

## Testing

### Manual Test Checklist

**Browser:**
- [ ] Draw shapes, undo/redo works
- [ ] Save locally, reload, content restored
- [ ] Export PNG/SVG downloads correctly

**Android:**
- [ ] Open document picker, load `.excalidraw` file
- [ ] Save to document, status shows success
- [ ] Export to gallery, image appears in Photos

### Emulator

```bash
# Create tablet emulator
make create-emulator

# Start emulator
make emu

# Run full test cycle
make run
```

## Contributing

See [.github/instructions/](.github/instructions/) for coding guidelines:
- `excalidraw-v0.18.0.instructions.md` — Excalidraw API rules
- `typescript-5-es2022.instructions.md` — TypeScript standards
- `kotlin-android.instructions.md` — Kotlin patterns
- `reactjs.instructions.md` — React best practices

## License

MIT — see [LICENSE](LICENSE)

Third-party attributions in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
