# Android Code Pitfalls & Potential Bugs

> **Date**: January 2, 2026
> **Scope**: Current Android implementation analysis
> **Files Reviewed**: MainActivity.kt, NativeBridge.kt, BooxDrawingActivity.kt, BooxDrawingHelper, GlobalDeviceReceiver.kt, BooxDeviceUtils.kt

---

## 🔴 Critical Issues

### 1. Memory Leak in Handler Usage (BooxDrawingHelper)

**Location**: `BooxDrawingHelper.pauseForUiRefresh()`

**Problem**: Creates new Handler instances on each call, and uses `postDelayed` without tracking or canceling pending runnables.

```kotlin
fun pauseForUiRefresh(onPaused: () -> Unit) {
    try {
        touchHelper?.setRawDrawingEnabled(false)
        // BUG: Creates new Handler each time - memory leak potential
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            onPaused()
            // BUG: Nested Handler also not tracked
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                touchHelper?.setRawDrawingEnabled(true)
            }, 50)
        }, 10)
    } catch (e: Exception) {
        // ...
    }
}
```

**Risk**:
- Memory leak if activity is destroyed while runnables are pending
- Potential NPE if `touchHelper` is nulled during delay
- Race condition if called rapidly multiple times

**Fix**:
```kotlin
// In BooxDrawingHelper
private val mainHandler = Handler(Looper.getMainLooper())
private val pendingRunnables = mutableListOf<Runnable>()

fun pauseForUiRefresh(onPaused: () -> Unit) {
    cancelPendingUiRefresh()

    val resumeRunnable = Runnable {
        touchHelper?.setRawDrawingEnabled(true)
    }
    val pauseRunnable = Runnable {
        onPaused()
        mainHandler.postDelayed(resumeRunnable, 50)
        pendingRunnables.add(resumeRunnable)
    }

    touchHelper?.setRawDrawingEnabled(false)
    mainHandler.postDelayed(pauseRunnable, 10)
    pendingRunnables.add(pauseRunnable)
}

fun cancelPendingUiRefresh() {
    pendingRunnables.forEach { mainHandler.removeCallbacks(it) }
    pendingRunnables.clear()
}

// Call in closeDrawing()
fun closeDrawing() {
    cancelPendingUiRefresh()
    // ... existing cleanup
}
```

---

### 2. Race Condition in completeNativeDrawing (NativeBridge)

**Location**: `NativeBridge.completeNativeDrawing()`

**Problem**: Base64 encoding happens on `ioScope`, then JS is evaluated on main thread. If user rapidly completes multiple drawings, they could arrive out of order.

```kotlin
fun completeNativeDrawing(pngBytes: ByteArray, width: Int, height: Int) {
    ioScope.launch {
        try {
            val base64 = Base64.encodeToString(pngBytes, Base64.NO_WRAP)
            val dataUrl = "data:image/png;base64,$base64"

            // BUG: No synchronization - rapid calls could interleave
            mainHandler.post {
                webView.evaluateJavascript(script) { result -> ... }
            }
        } catch (e: Exception) {
            // ...
        }
    }
}
```

**Risk**: Drawing insertions could occur in wrong order or overlap

**Severity**: Low (unlikely in practice due to UI flow)

---

### 3. Bitmap Not Recycled on Configuration Change

**Location**: `BooxDrawingActivity`

**Problem**: No `onSaveInstanceState` implementation. Bitmap is not recycled if activity is recreated due to configuration change.

```kotlin
override fun onDestroy() {
    // This handles normal destruction
    bitmap?.recycle()
    bitmap = null
    // ...
}

// MISSING: onSaveInstanceState - bitmap/strokes lost on rotation
```

**Risk**:
- Memory leak if device is rotated (old bitmap not recycled before new one created)
- User loses all work on configuration change

**Fix**: Add configuration change handling:
```kotlin
// In AndroidManifest.xml - prevent automatic restart
android:configChanges="orientation|screenSize|screenLayout"

// OR implement proper state saving
override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    // Save stroke data, current settings
}
```

---

### 4. Potential ANR in Export (BooxDrawingActivity)

**Location**: `BooxDrawingActivity.handleDone()`

**Problem**: While export runs on background thread, `showLoading()` is called on main thread but the dialog might not be shown before heavy work starts.

```kotlin
private fun handleDone() {
    showLoading("Exporting drawing...")  // Main thread

    Thread {  // Background thread
        try {
            val exportResult = exportToPng()  // Heavy work
            // ...
        }
    }.start()
}
```

**Risk**: On slow devices, UI might appear frozen briefly

**Better Approach**: Use `lifecycleScope` with proper coroutine context:
```kotlin
private fun handleDone() {
    lifecycleScope.launch {
        showLoading("Exporting drawing...")

        val exportResult = withContext(Dispatchers.IO) {
            exportToPng()
        }

        hideLoading()
        // Return result...
    }
}
```

---

## 🟡 Medium Issues

### 5. Unchecked Intent Extra Size (MainActivity → BooxDrawingActivity)

**Location**: `MainActivity.nativeDrawingLauncher`

**Problem**: PNG bytes are passed via Intent extras. Android has a ~500KB limit on Intent/Bundle data.

```kotlin
val pngBytes = data?.getByteArrayExtra(BooxDrawingActivity.EXTRA_DRAWING_PNG)
```

**Risk**: Large drawings will crash with `TransactionTooLargeException`

**Fix**: Use file-based transfer or ContentProvider:
```kotlin
// In BooxDrawingActivity - save to temp file
val tempFile = File(cacheDir, "drawing_${System.currentTimeMillis()}.png")
tempFile.writeBytes(exportResult.bytes)

val resultIntent = Intent().apply {
    putExtra(EXTRA_DRAWING_URI, Uri.fromFile(tempFile).toString())
    putExtra(EXTRA_DRAWING_WIDTH, exportResult.width)
    putExtra(EXTRA_DRAWING_HEIGHT, exportResult.height)
}

// In MainActivity - read from temp file
val uriString = data?.getStringExtra(BooxDrawingActivity.EXTRA_DRAWING_URI)
val uri = Uri.parse(uriString)
val pngBytes = contentResolver.openInputStream(uri)?.readBytes()
```

---

### 6. GlobalDeviceReceiver Not Unregistered on All Exit Paths

**Location**: `BooxDrawingActivity.onDestroy()`

**Problem**: Device receiver unregistration is in try-catch but could fail silently.

```kotlin
override fun onDestroy() {
    try {
        deviceReceiver?.enable(this, false)
    } catch (e: Exception) {
        Log.w(TAG, "onDestroy: Failed to disable device receiver", e)
    }
    deviceReceiver = null
    // ...
}
```

**Risk**: Leaked receiver if exception occurs

**Additional Issue**: Receiver not disabled on `onPause()` - could receive broadcasts when activity is in background.

**Fix**:
```kotlin
override fun onPause() {
    super.onPause()
    deviceReceiver?.enable(this, false)
}

override fun onResume() {
    super.onResume()
    if (booxDrawingHelper != null) {
        deviceReceiver?.enable(this, true)
    }
}
```

---

### 7. Potential NPE in BrushRenderer SDK Calls

**Location**: `BrushRenderer` object

**Problem**: SDK method calls assume SDK classes are available, but fallback isn't always graceful.

```kotlin
private fun renderFountainStroke(canvas: Canvas, stroke: StrokeData) {
    val paint = createPaint(stroke.color)
    val sdkPoints = toSdkTouchPoints(stroke.points, stroke.width)
    val maxPressure = getMaxPressure()  // Could return 0 or throw

    try {
        com.onyx.android.sdk.pen.NeoFountainPen.drawStroke(
            canvas,
            paint,
            sdkPoints,
            1.0f,
            stroke.width,
            maxPressure,  // BUG: If 0, division by zero in SDK
            false
        )
    } catch (e: Exception) {
        // Falls back, but user sees degraded quality
    }
}
```

**Risk**:
- If `maxPressure` is 0, SDK may crash or render incorrectly
- SDK behavior differences between firmware versions

**Fix**: Validate maxPressure before use:
```kotlin
private fun getMaxPressure(): Float {
    if (cachedMaxPressure <= 0f) {
        cachedMaxPressure = try {
            val pressure = EpdController.getMaxTouchPressure()
            if (pressure > 0f) pressure else 4096f
        } catch (e: Exception) {
            4096f // Safe default
        }
    }
    return cachedMaxPressure
}
```

---

### 8. Coroutine Scope Leak in NativeBridge

**Location**: `NativeBridge` class

**Problem**: `ioScope` is created with `Job()` but never cancelled when WebView is destroyed.

```kotlin
// In MainActivity
private val ioScope: CoroutineScope by lazy { CoroutineScope(ioDispatcher + Job()) }

// NativeBridge receives this scope but never cancels it
internal class NativeBridge(
    private val ioScope: CoroutineScope,
    // ...
)
```

**Risk**: Coroutines may continue running after activity is destroyed

**Fix**: Cancel scope in MainActivity.onDestroy():
```kotlin
override fun onDestroy() {
    super.onDestroy()
    ioScope.cancel()  // Add this
    binding.webView.destroy()
}
```

---

### 9. WebView JavaScript Injection Timing

**Location**: `MainActivity.DiagrammerWebViewClient.onPageStarted()`

**Problem**: Native state injected in `onPageStarted`, but React app may not be ready to read it.

```kotlin
override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
    super.onPageStarted(view, url, favicon)
    view?.evaluateJavascript("""
        window.__NATIVE_PRESENT__ = true;
        window.__NATIVE_HAS_BOOX_DRAWING__ = $hasBooxDrawing;
    """.trimIndent(), null)
}
```

**Risk**: Race condition - React app might read these values before they're set

**Current Mitigation**: Web app uses `hasBooxDrawingSupport()` function that reads from `window` - this is correct but relies on timing.

**Better Approach**: Double-inject (onPageStarted + onPageFinished) or use callback:
```kotlin
override fun onPageFinished(view: WebView?, url: String?) {
    super.onPageFinished(view, url)
    // Re-inject to ensure values are available
    view?.evaluateJavascript("""
        if (typeof window.__NATIVE_READY_CALLBACK__ === 'function') {
            window.__NATIVE_READY_CALLBACK__();
        }
    """.trimIndent(), null)
}
```

---

### 10. Fallback Touch Handler Missing Cancellation

**Location**: `BooxDrawingActivity.setupFallbackTouchHandler()`

**Problem**: No handling for `ACTION_CANCEL` event.

```kotlin
binding.surfaceView.setOnTouchListener { _, event ->
    when (event.action) {
        MotionEvent.ACTION_DOWN -> { ... }
        MotionEvent.ACTION_MOVE -> { ... }
        MotionEvent.ACTION_UP -> { ... }
        else -> false  // BUG: ACTION_CANCEL not handled
    }
}
```

**Risk**: Incomplete stroke if system steals touch (e.g., notification appears)

**Fix**:
```kotlin
MotionEvent.ACTION_CANCEL -> {
    // Discard current stroke
    currentStrokePoints.clear()
    Log.d(TAG, "Touch CANCELLED")
    true
}
```

---

## 🟢 Minor Issues / Code Smell

### 11. Hardcoded Magic Numbers

**Locations**: Multiple files

**Examples**:
```kotlin
// BooxDrawingActivity
val gestureZoneHeight = (48 * resources.displayMetrics.density).toInt()  // Why 48?
paint.alpha = 100  // Why 100?
paint.alpha = 220  // Why 220?

// NativeBridge
if (actualByteLen < envelope.byteLength / 2) {  // Why 50%?

// BrushRenderer
cachedMaxPressure = 4096f  // Magic default
```

**Fix**: Extract to named constants with documentation.

---

### 12. Duplicate Code in Stroke Rendering

**Location**: `BrushRenderer`

**Problem**: Each stroke renderer creates similar `Paint` objects and has similar null/size checks.

**Fix**: Extract common logic to base method.

---

### 13. Thread Safety of `strokes` List

**Location**: `BooxDrawingActivity`

**Problem**: `strokes` is a regular `mutableListOf` accessed from potentially multiple threads.

```kotlin
private val strokes = mutableListOf<StrokeData>()

// Accessed from:
// - Main thread (clearCanvas, handleClear)
// - SDK callback thread (onNativeStrokeComplete)
```

**Risk**: Concurrent modification exception (rare but possible)

**Fix**: Use synchronized access or `CopyOnWriteArrayList`:
```kotlin
private val strokes = Collections.synchronizedList(mutableListOf<StrokeData>())
// OR
private val strokes = CopyOnWriteArrayList<StrokeData>()
```

---

### 14. Missing Null Check After lateinit

**Location**: `BooxDrawingActivity`

**Problem**: `binding` is `lateinit` but used in callbacks that might fire before `onCreate` completes.

```kotlin
private lateinit var binding: ActivityBooxDrawingBinding

// In SurfaceHolder.Callback - could fire before binding is initialized
override fun surfaceCreated(holder: SurfaceHolder) {
    binding.root.post {  // Potential crash if binding not initialized
        initializeDrawingAfterLayout()
    }
}
```

**Risk**: Very low (surface callbacks should not fire before setContentView), but defensive coding would be safer.

---

### 15. AlertDialog Shown Without Lifecycle Check

**Location**: `BooxDrawingActivity.handleCancel()`, `handleClear()`

**Problem**: AlertDialog created without checking if activity is finishing.

```kotlin
private fun handleCancel() {
    if (hasDrawn) {
        // BUG: Could crash if activity is finishing
        AlertDialog.Builder(this)
            .setTitle("Discard Drawing")
            // ...
            .show()
    }
}
```

**Fix**:
```kotlin
if (hasDrawn && !isFinishing && !isDestroyed) {
    AlertDialog.Builder(this)
        // ...
}
```

---

### 16. Unhandled Exception in completeDocumentLoad

**Location**: `NativeBridge.completeDocumentLoad()`

**Problem**: Large files could cause OOM when reading entire content to string.

```kotlin
val text = context.contentResolver.openInputStream(uri)
    ?.bufferedReader()
    ?.use { it.readText() }  // Reads entire file to memory
```

**Risk**: OOM with very large scene files

**Mitigation**: Scene files are typically small, but a size check would be safer:
```kotlin
val fileSize = context.contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: 0L
if (fileSize > 50 * 1024 * 1024) {  // 50MB limit
    notifyJs("onNativeMessage", false, "File too large", null)
    return@launch
}
```

---

## Summary Table

| Issue | Severity | Likelihood | Impact | Effort to Fix |
|-------|----------|------------|--------|---------------|
| Handler memory leak | 🔴 Critical | Medium | Memory leak, crash | Medium |
| Bitmap config change | 🔴 Critical | Medium | Data loss | High |
| Intent size limit | 🟡 Medium | Low | Crash on large drawings | Medium |
| Receiver lifecycle | 🟡 Medium | Low | Battery drain | Low |
| SDK NPE | 🟡 Medium | Low | Visual glitch | Low |
| Coroutine scope leak | 🟡 Medium | Medium | Resource leak | Low |
| Touch cancel | 🟢 Minor | Low | Incomplete stroke | Low |
| Thread safety | 🟢 Minor | Very Low | Rare crash | Low |

---

## Recommended Priority Order

1. **Handler memory leak** - Fix immediately, clear crash/leak path
2. **Intent size limit** - Medium effort but prevents hard crash
3. **Coroutine scope cancellation** - Easy fix, prevents leak
4. **Configuration change handling** - Either handle or prevent
5. **Receiver lifecycle** - Quick fix, better battery life
6. **Touch cancel handling** - Easy, improves UX
7. **SDK NPE validation** - Defensive, prevents edge cases
