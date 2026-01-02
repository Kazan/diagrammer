# Boox Native Stylus API Research

## Implementation Status

> **Last Updated**: January 2, 2026

### ✅ Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| **Device Detection** | ✅ Done | `BooxDeviceUtils.kt` detects Onyx device, Pen SDK, EPD controller |
| **SDK Integration** | ✅ Done | `onyxsdk-pen:1.4.10.1`, `onyxsdk-device:1.3.0` bundled as `implementation` |
| **BooxDrawingActivity** | ✅ Done | Full native drawing canvas with SurfaceView + TouchHelper |
| **Brush Styles** | ✅ Done | Pencil, Fountain, Neo Brush, Marker, Charcoal |
| **Stroke Width Slider** | ✅ Done | Adjustable 1-20px width |
| **NativeBridge Integration** | ✅ Done | `openNativeDrawingCanvas()`, `hasFullBooxDrawingSupport()`, `getDeviceCapabilities()` |
| **MainActivity Callbacks** | ✅ Done | Launches activity, receives PNG result, passes to WebView |
| **TypeScript Types** | ✅ Done | `types.d.ts` updated with bridge types |
| **useNativeDrawing Hook** | ✅ Done | React hook manages native drawing lifecycle |
| **DrawingToolbar UI** | ✅ Done | "Native Draw" button shown conditionally |
| **Image Insertion** | ✅ Done | PNG inserted as Excalidraw image element at viewport center |
| **Cancel Callback** | ✅ Done | `window.cancelNativeDrawing()` resets UI state |
| **HiddenApiBypass** | ✅ Done | For Android 11+ hidden API access |

### 🎨 UI Refinements Made

- Cancel/Done buttons moved to bottom bar (right side)
- Brush buttons use consistent OutlinedButton style
- Active brush shows filled background (#D0D0D0)
- Native Draw button uses RailButton with `col-span-2` width

### 🔧 Build Configuration

- SDK dependencies changed from `compileOnly` to `implementation` (bundle in APK)
- Added exclusions for `com.android.support` duplicate classes
- Added `jniLibs.pickFirsts` for `libc++_shared.so` conflicts

### ⏳ Remaining / Not Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| **Background Image** | ❌ Not done | Show scene screenshot as background in native canvas |
| **Color Support** | ❌ Not done | Air4C supports 16 colors - not exposed in UI |
| **Eraser Mode** | ❌ Not done | SDK supports eraser via stylus button - not wired |
| **Undo/Redo** | ❌ Not done | No stroke history management |
| **Custom Brush Textures** | N/A | Not available in SDK |

---

## Target Device

**Boox Tab Ultra C / Air4C** - Kaleido 3 color e-ink display supporting **16 colors** (not just B&W).

## Key Goal: Hardware-Level E-Ink Drawing

The primary objective is to leverage the **actual e-ink hardware layer** for stylus input, not draw through the WebView or regular Android canvas. This is critical because:

- **Direct EPD access**: Stylus input goes directly to the e-ink controller (EPD), bypassing Android's rendering pipeline
- **Near-zero latency**: Hardware-accelerated stroke rendering appears instantly on screen (~10-20ms vs 50-100ms+ through WebView)
- **Pressure sensitivity**: Raw stylus pressure data from the Wacom digitizer layer
- **No ghosting**: Proper A2/DU waveform modes for fast, clean strokes without e-ink refresh artifacts
- **Battery efficient**: Hardware rendering uses significantly less power than software rendering

This is the same technology that makes the Boox Notes app feel like writing on paper.

## Executive Summary

**Yes, it is possible to integrate Boox's native stylus drawing capabilities into a third-party Android app.** Boox/Onyx provides an official SDK (`onyxsdk-pen`) that exposes their native stylus drawing engine, including support for pressure sensitivity, multiple brush types, and e-ink optimized rendering.

## Official Onyx SDK Overview

Based on the [OnyxAndroidDemo repository](https://github.com/crutchcorn/OnyxAndroidDemo/tree/upgrade-android-deps), Onyx provides two main SDKs for stylus drawing:

### 1. onyxsdk-pen (Recommended - Lighter Weight)

```gradle
implementation('com.onyx.android.sdk:onyxsdk-pen:1.4.10.1')
implementation('com.onyx.android.sdk:onyxsdk-device:1.3.0')
```

Repository requirement:
```gradle
maven { url "http://repo.boox.com/repository/maven-public/" }
```

### 2. onyxsdk-scribble (Full Featured)

Includes additional functionality like stroke persistence via DBFlow database.

---

## Available Stroke Styles

The SDK provides the following built-in stroke styles through `TouchHelper.setStrokeStyle()`:

| Style Constant | Description | Use Case |
|----------------|-------------|----------|
| `STROKE_STYLE_PENCIL` | Basic pencil stroke | Simple line drawing |
| `STROKE_STYLE_FOUNTAIN` | Fountain pen with pressure | Calligraphy, expressive strokes |
| `STROKE_STYLE_NEO_BRUSH` | Advanced brush rendering | Artistic brush strokes |
| `STROKE_STYLE_MARKER` | Marker/highlighter style | Highlighting, annotations |
| `STROKE_STYLE_CHARCOAL` | Charcoal texture | Sketching, artistic effects |
| `STROKE_STYLE_CHARCOAL_V2` | Charcoal v2 variant | Enhanced charcoal texture |

### Additional APIs via EpdController

For lower-level control via `EpdController.setStrokeStyle()`:

```kotlin
StrokeStyle.PENCIL    // Basic pencil
StrokeStyle.FOUNTAIN  // Fountain pen
StrokeStyle.NEO_BRUSH // Neo brush
StrokeStyle.MARKER    // Marker
StrokeStyle.CHARCOAL  // Charcoal
```

---

## Core API: TouchHelper

The `TouchHelper` class is the primary interface for stylus drawing:

### Basic Setup

```kotlin
// Initialize TouchHelper with a target view and callback
val touchHelper = TouchHelper.create(surfaceView, rawInputCallback)
    .setStrokeWidth(3.0f)
    .setLimitRect(limitRect, excludeRects) // Drawing region
    .openRawDrawing()

// Enable drawing mode
touchHelper.setRawDrawingEnabled(true)

// Set brush style
touchHelper.setStrokeStyle(TouchHelper.STROKE_STYLE_FOUNTAIN)
```

### Key Methods

| Method | Description |
|--------|-------------|
| `create(view, callback)` | Create TouchHelper instance |
| `setStrokeWidth(float)` | Set stroke width |
| `setStrokeStyle(int)` | Set brush/pen style |
| `setLimitRect(Rect, List<Rect>)` | Define drawable region and exclusions |
| `openRawDrawing()` | Initialize scribble mode |
| `closeRawDrawing()` | Release resources and unlock screen |
| `setRawDrawingEnabled(boolean)` | Enable/disable drawing |
| `setRawDrawingRenderEnabled(boolean)` | Enable/disable live rendering |
| `enableFingerTouch(boolean)` | Allow finger drawing (touch devices) |

### Input Callback Interface

```kotlin
val callback = object : RawInputCallback() {
    override fun onBeginRawDrawing(b: Boolean, touchPoint: TouchPoint) {
        // Stylus down - start of stroke
    }

    override fun onRawDrawingTouchPointMoveReceived(touchPoint: TouchPoint) {
        // Real-time point during stroke (for live feedback)
    }

    override fun onRawDrawingTouchPointListReceived(touchPointList: TouchPointList) {
        // Complete list of points before stroke end
    }

    override fun onEndRawDrawing(b: Boolean, touchPoint: TouchPoint) {
        // Stylus up - end of stroke
    }

    // Eraser button callbacks
    override fun onBeginRawErasing(b: Boolean, touchPoint: TouchPoint) {}
    override fun onRawErasingTouchPointMoveReceived(touchPoint: TouchPoint) {}
    override fun onRawErasingTouchPointListReceived(touchPointList: TouchPointList) {}
    override fun onEndRawErasing(b: Boolean, touchPoint: TouchPoint) {}
}
```

### TouchPoint Data

Each `TouchPoint` contains:
- `x`, `y` - Coordinates
- `pressure` - Pen pressure (0.0 to 1.0)
- `size` - Contact size
- `timestamp` - Event time

---

## Lower-Level EpdController API

For direct EPD (E-Paper Display) control:

```kotlin
// Enter scribble mode (locks screen updates)
Device.currentDevice().enterScribbleMode(view)

// Draw strokes
Device.currentDevice().moveTo(view, x, y, lineWidth)
Device.currentDevice().lineTo(x, y, UpdateMode.DU)

// Alternative stroke API with pressure
EpdController.startStroke(baseWidth, x, y, pressure, size, time)
EpdController.addStrokePoint(baseWidth, x, y, pressure, size, time)
EpdController.finishStroke(baseWidth, x, y, pressure, size, time)

// Set stroke properties
EpdController.setStrokeStyle(StrokeStyle.FOUNTAIN)
EpdController.setStrokeWidth(20f)
EpdController.setStrokeColor(0xff000000) // Black (only B&W supported on e-ink)

// Painter style
Device.currentDevice().setPainterStyle(
    true,                     // antiAlias
    Paint.Style.FILL_AND_STROKE,
    Paint.Join.ROUND,
    Paint.Cap.ROUND
)

// Leave scribble mode (unlocks screen)
Device.currentDevice().leaveScribbleMode(view)
```

---

## Pressure-Sensitive Brush Rendering

For custom brush rendering with pressure sensitivity, use `NeoFountainPen` or `NeoBrushPen`:

```kotlin
// NeoFountainPen for brush-like strokes with pressure
NeoFountainPen.drawStroke(
    canvas,
    paint,
    touchPointList.points,
    NumberUtils.FLOAT_ONE,   // pressure scale
    strokeWidth,
    EpdController.getMaxTouchPressure(),
    false  // transparent
)

// NeoBrushPen for advanced brush rendering
val brushPoints = NeoBrushPen.computeStrokePoints(
    points,
    strokeWidth,
    EpdController.getMaxTouchPressure()
)
PenUtils.drawStrokeByPointSize(canvas, paint, brushPoints, isTransparent)
```

---

## Integration Architecture for Diagrammer

### Capability Detection & Feature Flag

On app startup, `BooxDeviceUtils` detects if running on a Boox device with full native stylus support by checking three conditions:

```
hasFullBooxDrawingSupport = isOnyx && hasPenSdk && hasEpd
```

**Detection logs from Air4C:**
```
BooxDeviceUtils: Is Onyx Device: true
BooxDeviceUtils: Pen SDK Available: true
BooxDeviceUtils: EPD Controller Available: true
BooxDeviceUtils: hasFullBooxDrawingSupport: isOnyx=true, hasPenSdk=true, hasEpd=true
```

The app passes a single **`hasFullBooxDrawingSupport`** boolean flag to the React web app via the native bridge.

### React Web App Integration

The React app receives the capability flag and conditionally shows the native drawing button in the tools sidebar:

```typescript
// In drawing tools sidebar component
function DrawingToolsSidebar() {
    // hasFullBooxDrawingSupport passed from native bridge
    const hasNativeDrawing = window.Android?.hasFullBooxDrawingSupport ?? false;

    return (
        <div className="tools-sidebar">
            {/* ... existing tools ... */}

            {hasNativeDrawing && (
                    className="native-draw-button"
                    title="Draw with native Boox stylus"
                >
                    <PenIcon />
                    Native Draw
                </button>
            )}
        </div>
    );
}
```

### Proposed Approach: Native Drawing Overlay

```
┌─────────────────────────────────────────────────────────────┐
│                    Diagrammer App                           │
├─────────────────────────────────────────────────────────────┤
│  WebView (Excalidraw)                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │              Current Scene                            │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  [Native Draw Button] - Opens Native Canvas                 │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │        Native Drawing Activity                        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                                                 │  │  │
│  │  │  SurfaceView + TouchHelper                      │  │  │
│  │  │  - Background: Scene screenshot (optional)      │  │  │
│  │  │  - Drawing: Native Boox strokes                 │  │  │
│  │  │                                                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  [Brush] [Pencil] [Marker] [Width] [Done] [Cancel]    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  On "Done":                                                 │
│  1. Export drawing as PNG/SVG                               │
│  2. Pass bitmap to WebView via JS bridge                    │
│  3. Insert as image element into Excalidraw                 │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create Native Drawing Activity**
   ```kotlin
   class BooxDrawingActivity : AppCompatActivity() {
       private lateinit var touchHelper: TouchHelper
       private lateinit var surfaceView: SurfaceView
       private var bitmap: Bitmap? = null
       private var canvas: Canvas? = null

       // Stroke style selection
       private var currentStyle = TouchHelper.STROKE_STYLE_FOUNTAIN
       private var currentWidth = 3.0f
   }
   ```

2. **Export Drawing to Bitmap**
   ```kotlin
   fun exportDrawing(): Bitmap {
       return bitmap ?: throw IllegalStateException("No drawing")
   }

   fun exportToPNG(): ByteArray {
       val stream = ByteArrayOutputStream()
       bitmap?.compress(Bitmap.CompressFormat.PNG, 100, stream)
       return stream.toByteArray()
   }
   ```

3. **Bridge to WebView/Excalidraw**
   ```kotlin
   // In MainActivity, after returning from BooxDrawingActivity
   override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
       if (requestCode == DRAWING_REQUEST && resultCode == RESULT_OK) {
           val pngBytes = data?.getByteArrayExtra("drawing_png")
           val base64 = Base64.encodeToString(pngBytes, Base64.NO_WRAP)

           // Insert into Excalidraw via JS bridge
           webView.evaluateJavascript(
               "insertDrawingAsImage('data:image/png;base64,$base64')",
               null
           )
       }
   }
   ```

4. **WebView JS Handler**
   ```typescript
   // In web/src/native-bridge.ts
   window.insertDrawingAsImage = (dataUrl: string) => {
       const imageElement = {
           type: "image",
           fileId: generateId(),
           // ... other Excalidraw image element properties
       };
       excalidrawAPI.updateScene({
           elements: [...currentElements, imageElement],
           files: {
               [imageElement.fileId]: {
                   dataURL: dataUrl,
                   mimeType: "image/png",
                   created: Date.now()
               }
           }
       });
   };
   ```

---

## Limitations & Considerations

### What's Available
✅ Pressure-sensitive drawing
✅ Multiple brush styles (pencil, fountain, marker, charcoal, neo-brush)
✅ Adjustable stroke width
✅ Eraser support (hardware button on stylus)
✅ E-ink optimized rendering (A2/DU update modes)
✅ Touch point data for custom rendering

### What's NOT Available in SDK
❌ Full access to Notes app proprietary brushes (internal implementation)
❌ Handwriting recognition (separate system feature)
❌ AI-powered shape recognition
❌ Templates and stationery from Notes app
❌ Custom texture brushes beyond the provided styles

### Important Notes
1. **Device-Specific**: SDK only works on Boox/Onyx devices
2. **Color Support**: Air4C (Kaleido 3) supports 16 colors - capability detected at startup
3. **Screen Lock**: During scribble mode, screen updates are locked
4. **Performance**: Native e-ink drawing is optimized and very responsive
5. **Compatibility**: Test on target device firmware versions

---

## Sample Implementation Skeleton

```kotlin
// BooxDrawingActivity.kt
class BooxDrawingActivity : AppCompatActivity() {

    private lateinit var binding: ActivityBooxDrawingBinding
    private lateinit var touchHelper: TouchHelper
    private var bitmap: Bitmap? = null
    private var canvas: Canvas? = null
    private val paint = Paint().apply {
        isAntiAlias = true
        style = Paint.Style.STROKE
        color = Color.BLACK
        strokeWidth = 3f
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityBooxDrawingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        initSurfaceView()
        initToolbar()
    }

    private fun initSurfaceView() {
        touchHelper = TouchHelper.create(binding.surfaceView, rawInputCallback)

        binding.surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                val rect = Rect()
                binding.surfaceView.getLocalVisibleRect(rect)
                touchHelper
                    .setStrokeWidth(3f)
                    .setLimitRect(rect, emptyList())
                    .openRawDrawing()
                touchHelper.setStrokeStyle(TouchHelper.STROKE_STYLE_FOUNTAIN)
                touchHelper.setRawDrawingEnabled(true)
                clearCanvas()
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {}
            override fun surfaceDestroyed(holder: SurfaceHolder) {}
        })
    }

    private val rawInputCallback = object : RawInputCallback() {
        override fun onBeginRawDrawing(b: Boolean, touchPoint: TouchPoint) {
            // Start stroke
        }

        override fun onRawDrawingTouchPointListReceived(touchPointList: TouchPointList) {
            // Draw to bitmap
            drawStroke(touchPointList.points)
        }

        override fun onEndRawDrawing(b: Boolean, touchPoint: TouchPoint) {
            // End stroke
        }

        // ... other callbacks
    }

    private fun drawStroke(points: List<TouchPoint>) {
        if (bitmap == null) {
            bitmap = Bitmap.createBitmap(
                binding.surfaceView.width,
                binding.surfaceView.height,
                Bitmap.Config.ARGB_8888
            )
            canvas = Canvas(bitmap!!)
            canvas?.drawColor(Color.WHITE)
        }

        // Use NeoFountainPen for pressure-sensitive rendering
        NeoFountainPen.drawStroke(
            canvas, paint, points,
            1f, paint.strokeWidth,
            EpdController.getMaxTouchPressure(),
            false
        )
    }

    fun onDoneClick() {
        bitmap?.let {
            val stream = ByteArrayOutputStream()
            it.compress(Bitmap.CompressFormat.PNG, 100, stream)

            val result = Intent()
            result.putExtra("drawing_png", stream.toByteArray())
            setResult(RESULT_OK, result)
            finish()
        }
    }

    fun onBrushStyleSelected(style: Int) {
        touchHelper.setRawDrawingEnabled(false)
        touchHelper.setStrokeStyle(style)
        touchHelper.setRawDrawingEnabled(true)
    }

    override fun onDestroy() {
        touchHelper.closeRawDrawing()
        bitmap?.recycle()
        super.onDestroy()
    }
}
```

---

## Conclusion

The Boox/Onyx SDK provides robust native stylus drawing capabilities that can be integrated into Diagrammer. The SDK offers:

- **Multiple brush types** (pencil, fountain, marker, charcoal, neo-brush)
- **Pressure sensitivity** via TouchPoint data
- **E-ink optimized rendering** for responsive drawing
- **Full touch point data** for custom rendering algorithms

The recommended approach is to create a native Android Activity for drawing that:
1. Uses TouchHelper with a SurfaceView
2. Provides brush/tool selection UI
3. Exports the final drawing as a PNG
4. Returns the image to the main WebView to insert into Excalidraw

This maintains the separation between native e-ink optimized drawing and the Excalidraw canvas while providing access to Boox's superior stylus experience.

---

## References

- [OnyxAndroidDemo (upgrade-android-deps branch)](https://github.com/crutchcorn/OnyxAndroidDemo/tree/upgrade-android-deps)
- [Onyx Pen SDK Documentation](https://github.com/crutchcorn/OnyxAndroidDemo/blob/upgrade-android-deps/doc/Onyx-Pen-SDK.md)
- [Scribble API Documentation](https://github.com/crutchcorn/OnyxAndroidDemo/blob/upgrade-android-deps/doc/Scribble-API.md)
- Boox Maven Repository: `http://repo.boox.com/repository/maven-public/`
