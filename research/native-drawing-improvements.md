# Native Drawing Improvements Research

> **Date**: January 2, 2026
> **Status**: Planning
> **Scope**: Improvements that don't break the app, work on all tablets, with native drawing limited to current Boox checks

---

## Current Implementation Summary

### ✅ Completed Features

| Feature | Status | Location |
|---------|--------|----------|
| Device Detection | ✅ Done | `BooxDeviceUtils.kt` |
| SDK Integration | ✅ Done | `onyxsdk-pen:1.4.10.1`, `onyxsdk-device:1.3.0` |
| BooxDrawingActivity | ✅ Done | Full native drawing canvas with SurfaceView + TouchHelper |
| Brush Styles | ✅ Done | Pencil, Fountain, Neo Brush, Marker, Charcoal |
| Stroke Width Slider | ✅ Done | Adjustable 1-50px width |
| 16-Color Palette | ✅ Done | Kaleido 3 optimized colors |
| NativeBridge Integration | ✅ Done | `openNativeDrawingCanvas()`, `hasFullBooxDrawingSupport()` |
| Image Insertion | ✅ Done | PNG inserted as Excalidraw image element |
| Cancel Callback | ✅ Done | `window.cancelNativeDrawing()` resets UI state |
| GlobalDeviceReceiver | ✅ Done | System notification panel detection |
| Exclude Rects | ✅ Done | Sidebar, action bar, status bar exclusions |

### ❌ Not Implemented

| Feature | Notes |
|---------|-------|
| Background Image | Show scene screenshot as background in native canvas |
| Eraser Mode | SDK supports eraser via stylus button - not wired |
| Undo/Redo | No stroke history management |
| Session Persistence | Drawings lost if activity recreated |

---

## Improvement Recommendations

### 🔴 HIGH PRIORITY - User Experience & Reliability

#### 1. Undo/Redo for Native Drawing

**Current State**: No undo capability. Users must clear entire canvas and start over.

**Problem**: Frustrating UX, especially for detailed drawings.

**Proposed Solution**:
```kotlin
// In BooxDrawingActivity.kt
private val undoneStrokes = mutableListOf<StrokeData>()

private fun handleUndo() {
    if (strokes.isEmpty()) return

    // Move last stroke to undo stack
    undoneStrokes.add(strokes.removeLast())

    // Re-render bitmap from remaining strokes
    canvas?.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    for (stroke in strokes) {
        BrushRenderer.renderStroke(canvas!!, stroke)
    }
    renderBitmapToSurface()

    // Refresh EPD to show updated bitmap
    booxDrawingHelper?.forceEpdRefresh()
}

private fun handleRedo() {
    if (undoneStrokes.isEmpty()) return

    val stroke = undoneStrokes.removeLast()
    strokes.add(stroke)
    BrushRenderer.renderStroke(canvas!!, stroke)
    renderBitmapToSurface()
    booxDrawingHelper?.forceEpdRefresh()
}
```

**UI Changes**:
- Add undo/redo buttons to bottom action bar
- Show disabled state when stack is empty
- Clear redo stack when new stroke is drawn

**Effort**: Medium | **Impact**: High

---

#### 2. Background Image / Context Preview

**Current State**: Users draw blindly without seeing existing scene content.

**Problem**: Difficult to position native drawings relative to existing elements.

**Proposed Solution**:

**Android Side** (`MainActivity.kt`):
```kotlin
// Before launching BooxDrawingActivity
private fun captureSceneScreenshot(): ByteArray? {
    val webView = binding.webView
    val bitmap = Bitmap.createBitmap(webView.width, webView.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    webView.draw(canvas)

    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 80, stream)
    bitmap.recycle()
    return stream.toByteArray()
}

// Pass to activity
intent.putExtra(BooxDrawingActivity.EXTRA_BACKGROUND_IMAGE, screenshotBytes)
```

**BooxDrawingActivity**:
```kotlin
private var backgroundBitmap: Bitmap? = null

override fun onCreate(savedInstanceState: Bundle?) {
    // ... existing code ...

    // Load background if provided
    intent.getByteArrayExtra(EXTRA_BACKGROUND_IMAGE)?.let { bytes ->
        backgroundBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    }
}

private fun renderBitmapToSurface() {
    val holder = binding.surfaceView.holder
    val surfaceCanvas = holder.lockCanvas() ?: return
    try {
        // Draw white background
        surfaceCanvas.drawColor(Color.WHITE)

        // Draw scene screenshot at reduced opacity
        backgroundBitmap?.let { bg ->
            val bgPaint = Paint().apply { alpha = 60 } // ~25% opacity
            surfaceCanvas.drawBitmap(bg, 0f, 0f, bgPaint)
        }

        // Draw current strokes
        bitmap?.let { surfaceCanvas.drawBitmap(it, 0f, 0f, null) }
    } finally {
        holder.unlockCanvasAndPost(surfaceCanvas)
    }
}
```

**Considerations**:
- Background should NOT be included in export (it's reference only)
- Add toggle to show/hide background
- Consider performance impact on older devices

**Effort**: Medium | **Impact**: High

---

#### 3. Eraser Mode

**Current State**: SDK callbacks exist but are not wired to any functionality.

**Problem**: Users cannot correct mistakes without clearing entire canvas.

**Proposed Solution**:

**Option A: Stroke-by-Stroke Eraser** (Recommended)
```kotlin
// In BooxDrawingHelper callback
override fun onRawErasingTouchPointListReceived(touchPointList: TouchPointList?) {
    touchPointList?.let {
        val eraserPoints = extractTouchPoints(it)
        onEraserStroke(eraserPoints)
    }
}

// In BooxDrawingActivity
private fun onEraserStroke(points: List<BooxTouchPoint>) {
    if (points.isEmpty()) return

    // Find strokes that intersect with eraser path
    val eraserPath = createPathFromPoints(points)
    val strokesToRemove = strokes.filter { stroke ->
        val strokePath = createPathFromPoints(stroke.points)
        pathsIntersect(eraserPath, strokePath)
    }

    if (strokesToRemove.isNotEmpty()) {
        strokes.removeAll(strokesToRemove)
        // Add to undo stack as a group
        undoneStrokes.add(EraserAction(strokesToRemove))
        redrawAllStrokes()
    }
}
```

**Option B: Pixel Eraser** (More complex)
- Erases bitmap pixels directly
- Harder to implement undo
- More intuitive for small corrections

**UI Changes**:
- Add eraser button to brush toolbar
- Show eraser as active tool when stylus button pressed
- Visual indicator for eraser mode

**Effort**: Medium-High | **Impact**: High

---

### 🟡 MEDIUM PRIORITY - Robustness & Edge Cases

#### 4. Better Fallback for Non-Boox Tablets

**Current State**: Basic touch handling with no pressure sensitivity.

**Problem**: Poor drawing experience on Samsung, iPad (via Catalyst), other Android tablets.

**Proposed Improvements**:

```kotlin
// In BooxDrawingActivity.setupFallbackTouchHandler()
@Suppress("ClickableViewAccessibility")
private fun setupFallbackTouchHandler() {
    var lastX = 0f
    var lastY = 0f
    var currentStrokePoints = mutableListOf<BooxTouchPoint>()

    binding.surfaceView.setOnTouchListener { _, event ->
        // Palm rejection: ignore finger touches when stylus is expected
        val isStylus = event.getToolType(0) == MotionEvent.TOOL_TYPE_STYLUS
        val isFinger = event.getToolType(0) == MotionEvent.TOOL_TYPE_FINGER

        // If device has stylus, ignore finger input in drawing area
        if (isFinger && hasActiveStylusCapability()) {
            return@setOnTouchListener false
        }

        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x
                lastY = event.y
                currentStrokePoints.clear()
                currentStrokePoints.add(BooxTouchPoint(
                    x = event.x,
                    y = event.y,
                    pressure = event.pressure.coerceIn(0.1f, 1.0f),
                    size = event.size,
                    timestamp = event.eventTime
                ))
                true
            }
            MotionEvent.ACTION_MOVE -> {
                // Process historical points for smoother strokes
                for (i in 0 until event.historySize) {
                    currentStrokePoints.add(BooxTouchPoint(
                        x = event.getHistoricalX(i),
                        y = event.getHistoricalY(i),
                        pressure = event.getHistoricalPressure(i).coerceIn(0.1f, 1.0f),
                        size = event.getHistoricalSize(i),
                        timestamp = event.getHistoricalEventTime(i)
                    ))
                }
                currentStrokePoints.add(BooxTouchPoint(
                    x = event.x,
                    y = event.y,
                    pressure = event.pressure.coerceIn(0.1f, 1.0f),
                    size = event.size,
                    timestamp = event.eventTime
                ))

                // Draw incremental line with pressure
                val avgPressure = (currentStrokePoints.takeLast(2)
                    .map { it.pressure }.average()).toFloat()
                paint.strokeWidth = currentWidth * avgPressure
                canvas?.drawLine(lastX, lastY, event.x, event.y, paint)
                renderBitmapToSurface()

                lastX = event.x
                lastY = event.y
                true
            }
            MotionEvent.ACTION_UP -> {
                // Finalize stroke with all points
                if (currentStrokePoints.isNotEmpty()) {
                    val strokeData = StrokeData(
                        points = currentStrokePoints.toList(),
                        style = currentStyle,
                        color = currentColor,
                        width = currentWidth
                    )
                    strokes.add(strokeData)
                    hasDrawn = true
                }
                currentStrokePoints.clear()
                true
            }
            else -> false
        }
    }
}

private fun hasActiveStylusCapability(): Boolean {
    return packageManager.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN_MULTITOUCH) &&
           (Build.MANUFACTURER.lowercase().contains("samsung") ||
            Build.MANUFACTURER.lowercase().contains("wacom") ||
            packageManager.hasSystemFeature("android.hardware.stylus"))
}
```

**Benefits**:
- Pressure sensitivity on Samsung S-Pen, Wacom tablets
- Palm rejection prevents accidental marks
- Historical point processing for smoother strokes
- Works on any tablet with stylus support

**Effort**: Low-Medium | **Impact**: Medium

---

#### 5. Error Recovery in Native Bridge

**Current State**: Errors in native bridge can leave UI in broken state.

**Proposed Improvements**:

```typescript
// In useNativeDrawing.ts
const insertDrawing = useCallback(
  (dataUrl: string, width: number, height: number) => {
    setIsDrawing(false);

    if (!api) {
      console.error("[NativeDrawing] Excalidraw API not available");
      // Store for retry
      pendingDrawingRef.current = { dataUrl, width, height };
      setStatus?.({ text: "Canvas not ready, will retry...", tone: "warn" });
      return;
    }

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      console.error("[NativeDrawing] Invalid image data URL");
      setStatus?.({ text: "Invalid drawing data", tone: "err" });
      return;
    }

    try {
      // ... existing insertion logic ...
    } catch (err) {
      console.error("[NativeDrawing] Failed to insert drawing:", err);

      // Store for manual retry
      pendingDrawingRef.current = { dataUrl, width, height };
      setStatus?.({
        text: `Insert failed. Tap to retry.`,
        tone: "err"
      });
    }
  },
  [api, onInserted, setStatus]
);

// Retry pending drawing when API becomes available
useEffect(() => {
  if (api && pendingDrawingRef.current) {
    const pending = pendingDrawingRef.current;
    pendingDrawingRef.current = null;
    insertDrawing(pending.dataUrl, pending.width, pending.height);
  }
}, [api, insertDrawing]);
```

**Effort**: Low | **Impact**: Medium

---

#### 6. Bitmap Memory Management

**Current State**: No limits on drawing size; could OOM on low-memory devices.

**Proposed Improvements**:

```kotlin
// In BooxDrawingActivity
companion object {
    // Max bitmap size based on device memory
    private fun calculateMaxBitmapSize(context: Context): Int {
        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memoryClass = activityManager.memoryClass // MB available to app

        return when {
            memoryClass >= 512 -> 4096
            memoryClass >= 256 -> 3072
            memoryClass >= 128 -> 2048
            else -> 1536
        }
    }
}

private fun initBitmap(width: Int, height: Int) {
    val maxSize = calculateMaxBitmapSize(this)

    val scaledWidth: Int
    val scaledHeight: Int

    if (width > maxSize || height > maxSize) {
        val scale = minOf(maxSize.toFloat() / width, maxSize.toFloat() / height)
        scaledWidth = (width * scale).toInt()
        scaledHeight = (height * scale).toInt()

        Log.w(TAG, "initBitmap: Scaling down from ${width}x${height} to ${scaledWidth}x${scaledHeight}")
        setStatus("Canvas scaled for memory (${scaledWidth}x${scaledHeight})")
    } else {
        scaledWidth = width
        scaledHeight = height
    }

    bitmap?.recycle()
    bitmap = Bitmap.createBitmap(scaledWidth, scaledHeight, Bitmap.Config.ARGB_8888)
    canvas = Canvas(bitmap!!)

    // Track coordinate scaling for accurate stroke positioning
    bitmapScaleX = scaledWidth.toFloat() / width
    bitmapScaleY = scaledHeight.toFloat() / height
}
```

**Effort**: Low | **Impact**: Medium (prevents crashes)

---

### 🟢 NICE-TO-HAVE - Polish & Features

#### 7. Drawing Size/Position Control

**Current State**: Drawing inserted at center of viewport at original size.

**Proposed Improvements**:
- After native drawing completes, show preview overlay in Excalidraw
- Allow resize handles and drag to position
- Confirm button to finalize insertion
- Cancel to discard

**Implementation**: Requires new React component and additional bridge methods.

**Effort**: High | **Impact**: Medium

---

#### 8. Stroke Smoothing Options

**Current State**: Strokes use raw points from stylus.

**Proposed Improvements**:

```kotlin
// Catmull-Rom spline interpolation
fun smoothStrokePoints(points: List<BooxTouchPoint>, tension: Float = 0.5f): List<BooxTouchPoint> {
    if (points.size < 3) return points

    val smoothed = mutableListOf<BooxTouchPoint>()
    smoothed.add(points.first())

    for (i in 1 until points.size - 1) {
        val p0 = points[maxOf(0, i - 1)]
        val p1 = points[i]
        val p2 = points[minOf(points.size - 1, i + 1)]

        // Generate intermediate points using Catmull-Rom
        for (t in listOf(0.25f, 0.5f, 0.75f)) {
            val x = catmullRom(p0.x, p1.x, p2.x, t, tension)
            val y = catmullRom(p0.y, p1.y, p2.y, t, tension)
            val pressure = lerp(p1.pressure, p2.pressure, t)

            smoothed.add(BooxTouchPoint(x, y, pressure, p1.size, p1.timestamp))
        }
    }

    smoothed.add(points.last())
    return smoothed
}
```

**UI**: Add smoothing toggle or slider in settings.

**Effort**: Medium | **Impact**: Low-Medium

---

#### 9. Quick Color Picker Improvements

**Current State**: 16 Kaleido colors in fixed grid.

**Proposed Improvements**:
```kotlin
// Recently used colors (persisted in SharedPreferences)
private val recentColors = mutableListOf<Int>()
private val MAX_RECENT_COLORS = 4

private fun selectColor(color: Int) {
    currentColor = color
    paint.color = color
    booxDrawingHelper?.setStrokeColor(color)

    // Update recent colors
    recentColors.remove(color)
    recentColors.add(0, color)
    if (recentColors.size > MAX_RECENT_COLORS) {
        recentColors.removeLast()
    }

    // Persist
    prefs.edit().putString("recent_colors", recentColors.joinToString(",")).apply()

    updateColorButtonStates()
}
```

**UI Changes**:
- Add "Recent" row above color grid
- Highlight current color more prominently

**Effort**: Low | **Impact**: Low

---

#### 10. Session Persistence

**Current State**: Drawing lost if activity is destroyed (memory pressure, rotation).

**Proposed Improvements**:

```kotlin
override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)

    // Serialize strokes to JSON
    val strokesJson = strokes.map { stroke ->
        mapOf(
            "points" to stroke.points.map { p ->
                mapOf("x" to p.x, "y" to p.y, "pressure" to p.pressure,
                      "size" to p.size, "timestamp" to p.timestamp)
            },
            "style" to stroke.style,
            "color" to stroke.color,
            "width" to stroke.width
        )
    }

    outState.putString("strokes_json", Gson().toJson(strokesJson))
    outState.putInt("current_style", currentStyle)
    outState.putInt("current_color", currentColor)
    outState.putFloat("current_width", currentWidth)
}

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    savedInstanceState?.getString("strokes_json")?.let { json ->
        // Restore strokes
        val restoredStrokes = Gson().fromJson<List<Map<...>>>(json, ...)
        strokes.addAll(restoredStrokes.map { ... })
        hasDrawn = strokes.isNotEmpty()
    }
}
```

**Alternative**: Auto-save to temp file every N strokes.

**Effort**: Medium | **Impact**: Medium

---

### 🔧 Code Quality Improvements

#### 11. Brush Renderer Consistency

**Issue**: Native EPD preview may differ slightly from bitmap export.

**Current Approach**: Native EPD enabled + bitmap backup (best latency).

**Verification Steps**:
1. Add debug mode that exports both native capture and bitmap
2. Compare visually on device
3. Document any differences per brush style

**Potential Fix** (if differences are unacceptable):
```kotlin
// Disable native EPD rendering for perfect consistency
// Trade-off: ~40ms more latency
touchHelper?.setRawDrawingRenderEnabled(false)
```

**Effort**: Low | **Impact**: Low (current approach works)

---

#### 12. Device Receiver Edge Cases

**Current State**: Handles notification panel and screen on.

**Missing**:
- Split-screen/multi-window mode
- Screen rotation during drawing
- PIP mode

**Proposed**:
```kotlin
// Add to GlobalDeviceReceiver
const val ACTION_MULTI_WINDOW_CHANGED = "android.intent.action.MULTI_WINDOW_CHANGED"

// In enable()
filter.addAction(Intent.ACTION_CONFIGURATION_CHANGED)

// In onReceive()
Intent.ACTION_CONFIGURATION_CHANGED -> {
    Log.d(TAG, "Configuration changed (possibly rotation)")
    configurationChangeListener?.invoke()
}
```

**Effort**: Low | **Impact**: Low

---

#### 13. Logging & Diagnostics

**Current State**: Good logging exists but could be more structured.

**Proposed Improvements**:
```kotlin
object DrawingMetrics {
    var strokeCount = 0
    var totalPoints = 0
    var avgStrokeLatency = 0L
    var exportTime = 0L

    fun logSummary() {
        Log.i("DrawingMetrics", """
            |=== Drawing Session Metrics ===
            |Strokes: $strokeCount
            |Total Points: $totalPoints
            |Avg Stroke Latency: ${avgStrokeLatency}ms
            |Export Time: ${exportTime}ms
            |Device: ${Build.MODEL}
            |SDK: ${Build.VERSION.SDK_INT}
        """.trimMargin())
    }
}
```

**Effort**: Low | **Impact**: Low (debugging aid)

---

## Implementation Priority Matrix

| Improvement | Effort | Impact | Priority |
|-------------|--------|--------|----------|
| Undo/Redo | Medium | High | 🔴 P1 |
| Background Image | Medium | High | 🔴 P1 |
| Eraser Mode | Medium-High | High | 🔴 P1 |
| Better Fallback | Low-Medium | Medium | 🟡 P2 |
| Error Recovery | Low | Medium | 🟡 P2 |
| Memory Management | Low | Medium | 🟡 P2 |
| Size/Position Control | High | Medium | 🟢 P3 |
| Stroke Smoothing | Medium | Low-Medium | 🟢 P3 |
| Recent Colors | Low | Low | 🟢 P3 |
| Session Persistence | Medium | Medium | 🟢 P3 |

---

## Recommended Implementation Order

### Phase 1: Core UX (High Impact)
1. Undo/Redo support
2. Background image preview
3. Eraser mode

### Phase 2: Robustness
4. Better fallback touch handling
5. Error recovery in bridge
6. Memory management

### Phase 3: Polish
7. Recent colors
8. Session persistence
9. Stroke smoothing

### Phase 4: Advanced
10. Size/position control before insertion

---

## References

- [boox-eink-issues-research.md](./boox-eink-issues-research.md) - EPD rendering research
- [boox-native-stylus-api.md](./boox-native-stylus-api.md) - SDK documentation
- [olup/notable](https://github.com/olup/notable) - Reference implementation
- [saber-notes/saber](https://github.com/saber-notes/saber) - Alternative approach
