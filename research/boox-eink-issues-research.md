# BOOX E-Ink Native Drawing Issues - Research & Solutions

> **Date**: January 2, 2026
> **Status**: ✅ RESOLVED
> **Priority**: High

## Executive Summary

Our current BOOX native stylus drawing implementation had three critical issues:

1. **Full-screen overlay blocking system UI** - Cannot access BOOX system menus (top swipe) ✅ FIXED
2. **Mismatch between EPD preview and exported bitmap** - What user sees ≠ what gets exported ✅ FIXED
3. **Coordinate system misalignment** - Possible offset issues between TouchHelper coordinates and bitmap canvas ✅ FIXED

## Solution Implemented

After research, we adopted the **Native EPD + Bitmap Backup + DeviceReceiver** approach used by PatKreitzberg/notes-merge and aarontharris/atonyx:

1. **Native EPD rendering ENABLED** (`setRawDrawingRenderEnabled(true)`) for ultra-low latency (~10ms)
2. **Strokes also rendered to bitmap** for accurate export
3. **`GlobalDeviceReceiver`** detects system notification panel open/close and auto-disables drawing
4. **`setLimitRect` + `setExcludeRect`** confine drawing to canvas area, exclude toolbars and gesture zones

This gives us the best of both worlds: ultra-low latency native EPD preview AND accurate bitmap export.

---

This document contains the original research that led to this solution.

---

## Issue #1: Full-Screen EPD Overlay Blocking System UI

### Problem Description

When `setRawDrawingRenderEnabled(true)` is called, the Boox SDK takes control of the entire screen's EPD refresh pipeline. This:
- Blocks access to the system status bar / notification shade (top swipe down)
- Prevents system gestures from being recognized
- Makes the app feel "stuck" compared to native Boox apps like Notes

### Root Cause Analysis

Looking at our current implementation in `BooxDrawingHelper.openDrawing()`:

```kotlin
// Current approach - PROBLEMATIC
touchHelper.setLimitRect(bounds, emptyList())  // No exclude rects!
touchHelper.openRawDrawing()
touchHelper.setRawDrawingEnabled(true)
touchHelper.setRawDrawingRenderEnabled(true)  // Takes over entire EPD
```

**The issue**: We pass `emptyList()` for exclude rects, but more importantly, `setRawDrawingRenderEnabled(true)` takes over the entire screen's EPD update mechanism, not just the limit rect area.

### How Other Apps Solve This

#### olup/notable (Most Popular BOOX Notes App)

From `DrawCanvas.kt`:

```kotlin
fun updateActiveSurface() {
    val exclusionHeight =
        if (state.isToolbarOpen) convertDpToPixel(40.dp, context).toInt() else 0

    touchHelper.setRawDrawingEnabled(false)
    touchHelper.closeRawDrawing()

    // Key: Use setLimitRect with a List<Rect> overload, then setExcludeRect separately
    touchHelper.setLimitRect(
        mutableListOf(
            android.graphics.Rect(0, 0, this.width, this.height)
        )
    ).setExcludeRect(listOf(android.graphics.Rect(0, 0, this.width, exclusionHeight)))
        .openRawDrawing()

    touchHelper.setRawDrawingEnabled(true)
    updatePenAndStroke()
    refreshUi()
}
```

**Key differences from our code:**
1. They call `setLimitRect()` with a `List<Rect>` (possible multiple drawable regions)
2. They call `setExcludeRect()` SEPARATELY (not as a second parameter to setLimitRect)
3. They close and reopen raw drawing when changing bounds
4. **They do NOT call `setRawDrawingRenderEnabled(true)`** - they handle rendering themselves

#### saber-notes/saber

From `OnyxsdkPenArea.kt`:

```kotlin
init {
    view.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
        val limit = Rect()
        val exclude = emptyList<Rect>()
        view.getLocalVisibleRect(limit)
        touchHelper.setLimitRect(limit, exclude)  // Two-param version

        touchHelper.setRawDrawingEnabled(false)
        touchHelper.setRawDrawingEnabled(true)
    }

    touchHelper.openRawDrawing()
    touchHelper.setRawDrawingEnabled(true)
    touchHelper.setRawDrawingRenderEnabled(false)  // Disabled native render!
}
```

**Key insight**: Saber explicitly sets `setRawDrawingRenderEnabled(false)` and handles all rendering in their own code. This gives them full control.

### Proposed Solution for Issue #1

**Option A: Use setExcludeRect for system UI areas (Recommended)**

```kotlin
fun openDrawing(bounds: Rect, excludeRects: List<Rect> = emptyList()) {
    // Calculate status bar height (typically 24-48dp on BOOX devices)
    val statusBarHeight = getStatusBarHeight()

    // System exclude rect for top status bar area
    val systemExclude = Rect(0, 0, surfaceView.width, statusBarHeight)

    // Combine with user-provided exclude rects
    val allExcludes = excludeRects + listOf(systemExclude)

    touchHelper = TouchHelper.create(surfaceView, callback)
    touchHelper?.apply {
        setStrokeWidth(3.0f)

        // Set drawable area
        setLimitRect(mutableListOf(bounds))

        // Set exclusion areas SEPARATELY
        setExcludeRect(allExcludes)

        openRawDrawing()
        setRawDrawingEnabled(true)

        // CRITICAL: Don't use native EPD render - we handle our own rendering
        // This prevents the SDK from taking over the entire screen
        setRawDrawingRenderEnabled(false)
    }
}
```

**Option B: Fullscreen Activity with proper window flags**

Configure the Activity to coexist with system UI:

```kotlin
// In BooxDrawingActivity.onCreate()
window.decorView.systemUiVisibility =
    View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
    // Do NOT use SYSTEM_UI_FLAG_FULLSCREEN - this blocks system gestures
```

---

## Issue #2: Mismatch Between EPD Preview and Exported Bitmap

### Problem Description

The strokes drawn via the native EPD rendering (what user sees on e-ink) don't match what gets exported to the PNG bitmap that's inserted into Excalidraw.

### Root Cause Analysis

There are **two separate rendering paths**:

1. **EPD Native Rendering** (on-screen):
   - Triggered by `setRawDrawingRenderEnabled(true)`
   - Boox SDK renders strokes directly to the EPD hardware layer
   - Uses proprietary brush algorithms (NeoFountainPen, NeoBrushPen, etc.)
   - User sees this in real-time while drawing

2. **Bitmap Rendering** (export):
   - Our code in `BrushRenderer.renderStroke()`
   - We attempt to recreate the strokes using the same SDK pen classes
   - Rendered to a software Bitmap
   - This is what gets exported as PNG

**The mismatch occurs because:**

1. The EPD native rendering may use hardware-accelerated optimizations not available in software
2. Our `BrushRenderer` may not be using the exact same parameters as the SDK's EPD renderer
3. Coordinate transformation issues between EPD coordinates and bitmap coordinates
4. Some SDK pen classes may behave differently when drawing to Canvas vs EPD

### How Other Apps Solve This

#### olup/notable - "Single Source of Truth" Approach

Notable does NOT use `setRawDrawingRenderEnabled(true)`. Instead:

1. They receive stroke points via `onRawDrawingTouchPointListReceived()`
2. They immediately render the stroke to their own Bitmap
3. They update the SurfaceView from the Bitmap: `canvas.drawBitmap(page.windowedBitmap, 0f, 0f, Paint())`
4. They call `refreshUi()` which toggles `setRawDrawingEnabled` to force an EPD refresh

```kotlin
// From notable's handleDraw()
fun handleDraw(page: PageView, ..., points: List<TouchPoint>) {
    // Render stroke to page's bitmap
    val stroke = Stroke(points, style, color, width)
    page.addStrokes(listOf(stroke))

    // Draw to internal bitmap
    page.drawArea(strokeBounds)
}

// refreshUi forces EPD to show the bitmap
fun refreshUi() {
    drawCanvasToView()  // Locks surface, draws bitmap to it

    if (state.isDrawing) {
        // This toggle forces EPD to refresh with new content
        touchHelper.setRawDrawingEnabled(false)
        touchHelper.setRawDrawingEnabled(true)
    }
}
```

**Result**: What user sees = What gets exported (because both come from the same bitmap)

#### Trade-off: Latency

By not using native EPD rendering, there's a slight latency increase (~20-50ms vs ~5-10ms). However, the consistency is worth it for an export-focused app like ours.

### Proposed Solution for Issue #2

**Approach: Disable Native EPD Rendering, Use Bitmap as Single Source**

```kotlin
class BooxDrawingHelper(...) {
    fun openDrawing(bounds: Rect, excludeRects: List<Rect>) {
        touchHelper = TouchHelper.create(surfaceView, callback)
        touchHelper?.apply {
            setStrokeWidth(3.0f)
            setLimitRect(bounds, excludeRects)
            openRawDrawing()
            setRawDrawingEnabled(true)

            // DISABLE native EPD rendering - we render to our bitmap
            setRawDrawingRenderEnabled(false)
        }
    }
}

// In BooxDrawingActivity
private fun onNativeStrokeComplete(points: List<BooxTouchPoint>) {
    // 1. Store stroke data
    val strokeData = StrokeData(points, currentStyle, currentColor, currentWidth)
    strokes.add(strokeData)

    // 2. Render to our bitmap (single source of truth)
    BrushRenderer.renderStroke(canvas, strokeData)

    // 3. Display bitmap on SurfaceView
    renderBitmapToSurface()

    // 4. Force EPD refresh to show the new content
    forceEpdRefresh()
}

private fun forceEpdRefresh() {
    // Toggle drawing state to trigger EPD refresh
    booxDrawingHelper?.setDrawingEnabled(false)
    booxDrawingHelper?.setDrawingEnabled(true)
}
```

---

## Issue #3: Coordinate System Alignment

### Problem Description

There may be coordinate offsets between:
- TouchHelper's reported touch coordinates
- The SurfaceView's canvas coordinates
- Screen coordinates (for exclude rects)

### Analysis of Current Code

```kotlin
// We calculate bounds using SurfaceView local coordinates
val surfaceRect = Rect()
binding.surfaceView.getLocalVisibleRect(surfaceRect)

// Then calculate drawing bounds with margin
val bounds = Rect(
    marginPx,
    marginPx,
    surfaceRect.width() - marginPx,
    surfaceRect.height() - marginPx
)
```

But TouchHelper may report coordinates in screen space, not view-local space.

### How Other Apps Handle This

From notable's `updateActiveSurface()`:
```kotlin
touchHelper.setLimitRect(
    mutableListOf(
        android.graphics.Rect(0, 0, this.width, this.height)  // View's own dimensions
    )
)
```

They use the view's own dimensions (0,0 to width,height) as the limit rect. The SDK handles coordinate transformation internally.

### Proposed Fix

Ensure we're using view-local coordinates consistently:

```kotlin
private fun calculateDrawingBounds(): Rect {
    // Use simple view-local bounds
    val bounds = Rect(0, 0, binding.surfaceView.width, binding.surfaceView.height)

    // Optionally inset for visual padding, but keep coordinates view-local
    bounds.inset(marginPx, marginPx)

    return bounds
}
```

---

## Implementation Priority

### Phase 1: Fix Single Source Rendering (Highest Priority)
1. Set `setRawDrawingRenderEnabled(false)` in `BooxDrawingHelper`
2. Update `onNativeStrokeComplete()` to render to bitmap and call `renderBitmapToSurface()`
3. Implement EPD refresh toggle after each stroke

### Phase 2: Fix Exclude Rects for System UI
1. Add status bar height detection
2. Use `setExcludeRect()` separately from `setLimitRect()`
3. Test system gesture access

### Phase 3: Coordinate System Verification
1. Add debug logging for coordinate values
2. Verify touch points match bitmap coordinates
3. Test edge cases (screen edges, toolbar overlaps)

---

## Code Changes Required

### File: `BooxDrawingActivity.kt`

```kotlin
// In initializeDrawingAfterLayout()
booxDrawingHelper?.apply {
    setStrokeWidth(currentWidth)
    setStrokeStyle(currentStyle)
    setStrokeColor(currentColor)
    openDrawing(drawingBounds, excludeRects)
}

// Update onNativeStrokeComplete()
private fun onNativeStrokeComplete(points: List<BooxTouchPoint>) {
    if (points.isEmpty()) return
    hasDrawn = true

    val strokeData = StrokeData(
        points = points.toList(),
        style = currentStyle,
        color = currentColor,
        width = currentWidth
    )
    strokes.add(strokeData)

    // Render to bitmap (single source of truth)
    BrushRenderer.renderStroke(canvas, strokeData)

    // Update surface display
    renderBitmapToSurface()

    // Force EPD to refresh with new bitmap content
    booxDrawingHelper?.forceEpdRefresh()
}
```

### File: `BooxDrawingHelper` (within BooxDrawingActivity.kt)

```kotlin
class BooxDrawingHelper(...) {

    fun openDrawing(bounds: Rect, excludeRects: List<Rect> = emptyList()) {
        val callback = object : RawInputCallback() {
            // ... existing callbacks ...
        }

        touchHelper = TouchHelper.create(surfaceView, callback)

        touchHelper?.apply {
            setStrokeWidth(3.0f)

            // Use separate calls for limit and exclude
            setLimitRect(mutableListOf(bounds))
            if (excludeRects.isNotEmpty()) {
                setExcludeRect(excludeRects)
            }

            openRawDrawing()
            setRawDrawingEnabled(true)

            // CRITICAL: Disable native EPD rendering
            // We render everything to our bitmap for consistency
            try {
                setRawDrawingRenderEnabled(false)
                Log.i(TAG, "Native EPD rendering DISABLED - using bitmap rendering")
            } catch (e: Exception) {
                Log.w(TAG, "setRawDrawingRenderEnabled not available", e)
            }
        }

        isOpen = true
    }

    fun forceEpdRefresh() {
        try {
            touchHelper?.setRawDrawingEnabled(false)
            touchHelper?.setRawDrawingEnabled(true)
            Log.d(TAG, "EPD refresh triggered")
        } catch (e: Exception) {
            Log.w(TAG, "forceEpdRefresh failed", e)
        }
    }
}
```

---

## References

1. [olup/notable](https://github.com/olup/notable) - DrawCanvas.kt implementation
2. [saber-notes/saber](https://github.com/saber-notes/saber) - OnyxsdkPenArea.kt implementation
3. [sergeylappo/boox-rapid-draw](https://github.com/sergeylappo/boox-rapid-draw) - Overlay service approach
4. [OnyxAndroidDemo](https://github.com/crutchcorn/OnyxAndroidDemo) - Official SDK examples

---

## Testing Checklist

- [ ] Can access system notification shade by swiping down from top
- [ ] Drawn strokes match exported PNG exactly
- [ ] No coordinate offset at screen edges
- [ ] Toolbar buttons remain clickable
- [ ] Color rendering matches between preview and export
- [ ] Brush styles render consistently
- [ ] Performance acceptable (~50ms latency is OK for export app)
