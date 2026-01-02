@file:Suppress("DEPRECATION")

package com.kazan.diagrammer.boox

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.SurfaceHolder
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.kazan.diagrammer.databinding.ActivityBooxDrawingBinding
import java.io.ByteArrayOutputStream
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Native Boox stylus drawing activity.
 *
 * This activity provides hardware-accelerated e-ink stylus drawing using
 * Boox's native SDK. The drawing is exported as a PNG bitmap and returned
 * to the calling activity for insertion into Excalidraw.
 *
 * Key features:
 * - Direct EPD access for near-zero latency (~10-20ms)
 * - Pressure-sensitive strokes from Wacom digitizer
 * - Multiple brush styles (pencil, fountain, brush, marker, charcoal)
 * - Adjustable stroke width
 *
 * Flow:
 * 1. User taps "Native Draw" in web UI
 * 2. MainActivity launches this activity
 * 3. User draws with hardware stylus
 * 4. User taps "Done" → bitmap exported as PNG
 * 5. PNG returned to MainActivity → passed to WebView as base64
 * 6. Excalidraw inserts as image element
 */
class BooxDrawingActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "BooxDrawingActivity"

        // Intent extras
        const val EXTRA_DRAWING_PNG = "drawing_png"
        const val EXTRA_DRAWING_WIDTH = "drawing_width"
        const val EXTRA_DRAWING_HEIGHT = "drawing_height"

        // Result codes
        const val RESULT_DRAWING_COMPLETE = 1
        const val RESULT_DRAWING_CANCELLED = 2

        // Brush style constants (mirroring TouchHelper constants)
        // These values match the SDK's TouchHelper.STROKE_STYLE_* constants
        const val STYLE_PENCIL = 0
        const val STYLE_FOUNTAIN = 1
        const val STYLE_NEO_BRUSH = 2
        const val STYLE_MARKER = 3
        const val STYLE_CHARCOAL = 4

        /**
         * Kaleido 3 color palette - 16 colors optimized for e-ink display.
         * These colors are specifically chosen for best rendering on Boox color e-ink.
         */
        val KALEIDO_COLORS = listOf(
            0xFF000000.toInt(), // Black
            0xFF424242.toInt(), // Dark Gray
            0xFF757575.toInt(), // Gray
            0xFFBDBDBD.toInt(), // Light Gray
            0xFFD32F2F.toInt(), // Red
            0xFFE91E63.toInt(), // Pink
            0xFF9C27B0.toInt(), // Purple
            0xFF673AB7.toInt(), // Deep Purple
            0xFF3F51B5.toInt(), // Indigo
            0xFF2196F3.toInt(), // Blue
            0xFF03A9F4.toInt(), // Light Blue
            0xFF009688.toInt(), // Teal
            0xFF4CAF50.toInt(), // Green
            0xFF8BC34A.toInt(), // Light Green
            0xFFFFEB3B.toInt(), // Yellow
            0xFFFF9800.toInt(), // Orange
        )

        /**
         * Creates an intent to launch this activity.
         */
        fun createIntent(context: Context): Intent {
            return Intent(context, BooxDrawingActivity::class.java)
        }

        /**
         * Force EPD refresh on a view using EpdController.
         * This is necessary because raw drawing mode uses A2/DU mode
         * which doesn't refresh other parts of the screen.
         */
        private fun forceEpdRefresh(view: View) {
            try {
                // Try the most common EpdController location
                val epdClass = Class.forName("com.onyx.android.sdk.api.device.epd.EpdController")
                val invalidateMethod = epdClass.getMethod("invalidate", View::class.java, Int::class.java)
                // UpdateMode.GC16 = 2 for quality refresh
                invalidateMethod.invoke(null, view, 2)
                Log.d(TAG, "forceEpdRefresh: Refreshed view via EpdController")
            } catch (e: Exception) {
                Log.d(TAG, "forceEpdRefresh: EpdController not available, using standard invalidate")
                // Fallback to standard invalidation
                view.invalidate()
                view.requestLayout()
            }
        }
    }

    private lateinit var binding: ActivityBooxDrawingBinding

    // Drawing state
    private var bitmap: Bitmap? = null
    private var canvas: Canvas? = null
    private val paint = Paint().apply {
        isAntiAlias = true
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
        color = Color.BLACK
        strokeWidth = 3f
    }

    // Current tool settings
    private var currentStyle = STYLE_FOUNTAIN
    private var currentWidth = 3f
    private var currentColor = Color.BLACK
    private var hasDrawn = false

    // Stored strokes for proper re-rendering with brush styles
    private val strokes = mutableListOf<StrokeData>()

    // Color buttons for easy iteration
    private val colorButtons = mutableListOf<View>()

    // Boox SDK wrapper (null on non-Boox devices)
    private var booxDrawingHelper: BooxDrawingHelper? = null

    // Brush buttons for easy iteration
    private val brushButtons = mutableMapOf<Int, MaterialButton>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "═══════════════════════════════════════")
        Log.i(TAG, "onCreate: Starting BooxDrawingActivity")
        Log.i(TAG, "═══════════════════════════════════════")

        binding = ActivityBooxDrawingBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Log device capabilities
        Log.i(TAG, "Device: ${BooxDeviceUtils.deviceModel}")
        Log.i(TAG, "hasFullBooxDrawingSupport: ${BooxDeviceUtils.hasFullBooxDrawingSupport}")

        initSurfaceView()
        initToolbar()
        initBrushButtons()
        initColorButtons()
        initWidthSlider()

        Log.i(TAG, "onCreate: Initialization complete")
    }

    /**
     * Initialize the SurfaceView for drawing.
     * On Boox devices, this integrates with the native TouchHelper SDK.
     * On other devices, falls back to standard Android touch handling.
     */
    private fun initSurfaceView() {
        Log.d(TAG, "initSurfaceView: Setting up SurfaceView...")

        binding.surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                Log.i(TAG, "surfaceCreated: Surface ready")

                // Wait for layout to complete to get proper toolbar measurements
                binding.root.post {
                    initializeDrawingAfterLayout()
                }
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
                Log.d(TAG, "surfaceChanged: ${width}x$height, format=$format")
            }

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                Log.d(TAG, "surfaceDestroyed: Cleaning up...")
                booxDrawingHelper?.closeDrawing()
            }
        })
    }

    /**
     * Initialize drawing after layout is complete so we can measure toolbar heights.
     */
    private fun initializeDrawingAfterLayout() {
        val surfaceRect = Rect()
        binding.surfaceView.getLocalVisibleRect(surfaceRect)
        Log.d(TAG, "initializeDrawingAfterLayout: Surface size = ${surfaceRect.width()}x${surfaceRect.height()}")

        // Get screen location of SurfaceView
        val surfaceLocation = IntArray(2)
        binding.surfaceView.getLocationOnScreen(surfaceLocation)
        Log.d(TAG, "initializeDrawingAfterLayout: Surface location = (${surfaceLocation[0]}, ${surfaceLocation[1]})")

        // Initialize bitmap for drawing
        initBitmap(surfaceRect.width(), surfaceRect.height())

        // Clear canvas to white
        clearCanvas()

        // Calculate exclude rectangles for top and bottom toolbars
        val excludeRects = calculateExcludeRects()
        Log.i(TAG, "initializeDrawingAfterLayout: Exclude rects count = ${excludeRects.size}")
        for ((index, rect) in excludeRects.withIndex()) {
            Log.d(TAG, "  Exclude rect[$index]: ${rect.left},${rect.top} - ${rect.right},${rect.bottom}")
        }

        // Calculate the actual drawing bounds (between top and bottom toolbars)
        val drawingBounds = calculateDrawingBounds()
        Log.i(TAG, "initializeDrawingAfterLayout: Drawing bounds = ${drawingBounds.left},${drawingBounds.top} - ${drawingBounds.right},${drawingBounds.bottom}")

        // Try to initialize Boox SDK
        if (BooxDeviceUtils.hasFullBooxDrawingSupport) {
            Log.i(TAG, "initializeDrawingAfterLayout: Initializing Boox TouchHelper...")
            try {
                booxDrawingHelper = BooxDrawingHelper(
                    surfaceView = binding.surfaceView,
                    onStrokeComplete = { points -> onNativeStrokeComplete(points) }
                )
                booxDrawingHelper?.apply {
                    setStrokeWidth(currentWidth)
                    setStrokeStyle(currentStyle)
                    setStrokeColor(currentColor)
                    openDrawing(drawingBounds, excludeRects)
                }
                Log.i(TAG, "initializeDrawingAfterLayout: Boox TouchHelper initialized successfully!")
            } catch (e: Exception) {
                Log.e(TAG, "initializeDrawingAfterLayout: Failed to initialize Boox SDK", e)
                // Fall back to standard touch handling
                setupFallbackTouchHandler()
            }
        } else {
            Log.i(TAG, "initializeDrawingAfterLayout: No Boox SDK, using fallback touch handling")
            setupFallbackTouchHandler()
        }
    }

    /**
     * Calculate exclude rectangles for UI areas that should not receive stylus input.
     * With left sidebar layout, we exclude the sidebar and bottom action bar.
     */
    private fun calculateExcludeRects(): List<Rect> {
        val excludeRects = mutableListOf<Rect>()

        // Get screen location of SurfaceView for coordinate conversion
        val surfaceLocation = IntArray(2)
        binding.surfaceView.getLocationOnScreen(surfaceLocation)

        // Left sidebar exclude rect
        val sidebarLocation = IntArray(2)
        binding.leftSidebar.getLocationOnScreen(sidebarLocation)
        val sidebarRect = Rect(
            sidebarLocation[0] - surfaceLocation[0],
            sidebarLocation[1] - surfaceLocation[1],
            sidebarLocation[0] - surfaceLocation[0] + binding.leftSidebar.width,
            sidebarLocation[1] - surfaceLocation[1] + binding.leftSidebar.height
        )
        excludeRects.add(sidebarRect)
        Log.d(TAG, "calculateExcludeRects: Sidebar rect = $sidebarRect")

        // Bottom action bar exclude rect
        val actionBarLocation = IntArray(2)
        binding.bottomActionBar.getLocationOnScreen(actionBarLocation)
        val actionBarRect = Rect(
            actionBarLocation[0] - surfaceLocation[0],
            actionBarLocation[1] - surfaceLocation[1],
            actionBarLocation[0] - surfaceLocation[0] + binding.bottomActionBar.width,
            actionBarLocation[1] - surfaceLocation[1] + binding.bottomActionBar.height
        )
        excludeRects.add(actionBarRect)
        Log.d(TAG, "calculateExcludeRects: Action bar rect = $actionBarRect")

        return excludeRects
    }

    /**
     * Calculate the drawing bounds (the SurfaceView area where drawing is allowed).
     * With left sidebar layout, the SurfaceView is already constrained to the right of the sidebar,
     * so we just use its full bounds.
     */
    private fun calculateDrawingBounds(): Rect {
        // Get SurfaceView dimensions - this is already the drawing area
        val surfaceRect = Rect()
        binding.surfaceView.getLocalVisibleRect(surfaceRect)

        // Add a small margin (4dp converted to pixels) to ensure clean separation
        val marginPx = (4 * resources.displayMetrics.density).toInt()

        val bounds = Rect(
            marginPx,
            marginPx,
            surfaceRect.width() - marginPx,
            surfaceRect.height() - marginPx
        )

        Log.d(TAG, "calculateDrawingBounds: Surface size = ${surfaceRect.width()}x${surfaceRect.height()}")
        Log.d(TAG, "calculateDrawingBounds: Final bounds = ${bounds.left},${bounds.top} - ${bounds.right},${bounds.bottom}")

        return bounds
    }

    /**
     * Initialize the drawing bitmap.
     */
    private fun initBitmap(width: Int, height: Int) {
        Log.d(TAG, "initBitmap: Creating ${width}x$height bitmap")

        // Recycle old bitmap if exists
        bitmap?.recycle()

        bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        canvas = Canvas(bitmap!!)

        Log.d(TAG, "initBitmap: Bitmap created successfully")
    }

    /**
     * Setup fallback touch handling for non-Boox devices.
     * This provides basic drawing functionality using standard Android touch events.
     */
    @Suppress("ClickableViewAccessibility")
    private fun setupFallbackTouchHandler() {
        Log.d(TAG, "setupFallbackTouchHandler: Setting up standard touch handling")

        var lastX = 0f
        var lastY = 0f

        binding.surfaceView.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    lastX = event.x
                    lastY = event.y
                    Log.v(TAG, "Touch DOWN: ($lastX, $lastY)")
                    true
                }
                android.view.MotionEvent.ACTION_MOVE -> {
                    val currentX = event.x
                    val currentY = event.y

                    // Draw line from last point to current
                    canvas?.drawLine(lastX, lastY, currentX, currentY, paint)
                    hasDrawn = true

                    // Update the surface
                    renderBitmapToSurface()

                    lastX = currentX
                    lastY = currentY
                    true
                }
                android.view.MotionEvent.ACTION_UP -> {
                    Log.v(TAG, "Touch UP: ($lastX, $lastY)")
                    true
                }
                else -> false
            }
        }
    }

    /**
     * Render the current bitmap to the SurfaceView.
     */
    private fun renderBitmapToSurface() {
        val holder = binding.surfaceView.holder
        val surfaceCanvas = holder.lockCanvas() ?: return
        try {
            bitmap?.let { surfaceCanvas.drawBitmap(it, 0f, 0f, null) }
        } finally {
            holder.unlockCanvasAndPost(surfaceCanvas)
        }
    }

    /**
     * Handle stroke completion from native Boox SDK.
     * The points contain x, y, pressure, and timestamp data.
     * We store the stroke data with style info for proper rendering on export.
     */
    private fun onNativeStrokeComplete(points: List<BooxTouchPoint>) {
        Log.d(TAG, "onNativeStrokeComplete: Received ${points.size} points, style=$currentStyle, color=${Integer.toHexString(currentColor)}, width=$currentWidth")

        if (points.isEmpty()) return

        hasDrawn = true

        // Store stroke data with current settings for later rendering
        val strokeData = StrokeData(
            points = points.toList(),
            style = currentStyle,
            color = currentColor,
            width = currentWidth
        )
        strokes.add(strokeData)

        // Render this stroke to our bitmap using the brush renderer
        val localCanvas = canvas ?: return
        BrushRenderer.renderStroke(localCanvas, strokeData)

        // Note: We don't call renderBitmapToSurface() because the SDK is already
        // rendering to the EPD with native brush styles via setRawDrawingRenderEnabled(true)
    }

    /**
     * Initialize toolbar buttons (Cancel/Done).
     */
    private fun initToolbar() {
        binding.btnCancel.setOnClickListener {
            Log.i(TAG, "Cancel button clicked")
            handleCancel()
        }

        binding.btnDone.setOnClickListener {
            Log.i(TAG, "Done button clicked")
            handleDone()
        }

        binding.btnClear.setOnClickListener {
            Log.i(TAG, "Clear button clicked")
            handleClear()
        }
    }

    /**
     * Initialize brush style buttons.
     */
    private fun initBrushButtons() {
        brushButtons[STYLE_PENCIL] = binding.btnPencil
        brushButtons[STYLE_FOUNTAIN] = binding.btnFountain
        brushButtons[STYLE_NEO_BRUSH] = binding.btnNeoBrush
        brushButtons[STYLE_MARKER] = binding.btnMarker
        brushButtons[STYLE_CHARCOAL] = binding.btnCharcoal

        binding.btnPencil.setOnClickListener { selectBrush(STYLE_PENCIL, "Pencil") }
        binding.btnFountain.setOnClickListener { selectBrush(STYLE_FOUNTAIN, "Fountain Pen") }
        binding.btnNeoBrush.setOnClickListener { selectBrush(STYLE_NEO_BRUSH, "Neo Brush") }
        binding.btnMarker.setOnClickListener { selectBrush(STYLE_MARKER, "Marker") }
        binding.btnCharcoal.setOnClickListener { selectBrush(STYLE_CHARCOAL, "Charcoal") }

        // Set initial selection
        updateBrushButtonStates()
    }

    /**
     * Initialize the color selection buttons as a 2-column grid.
     * Swatches expand to fill the full sidebar width.
     */
    private fun initColorButtons() {
        val colorContainer = binding.colorContainer
        colorContainer.removeAllViews()
        colorButtons.clear()

        // Smaller swatches with more padding - makes color section more compact
        val buttonSize = (32 * resources.displayMetrics.density).toInt()
        val margin = (6 * resources.displayMetrics.density).toInt()

        for ((index, color) in KALEIDO_COLORS.withIndex()) {
            val colorView = View(this).apply {
                layoutParams = android.widget.GridLayout.LayoutParams().apply {
                    width = buttonSize
                    height = buttonSize
                    setMargins(margin, margin, margin, margin)
                }

                // Add border for visibility (especially for light colors)
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(color)
                    setStroke((1 * resources.displayMetrics.density).toInt(), Color.parseColor("#888888"))
                    cornerRadius = 4 * resources.displayMetrics.density
                }

                setOnClickListener { selectColor(index, color) }
            }
            colorContainer.addView(colorView)
            colorButtons.add(colorView)
        }

        // Set initial selection
        updateColorButtonStates()
    }

    /**
     * Initialize the stroke width slider.
     * The slider is rotated 90° to display vertically, filling the remaining sidebar height.
     */
    private fun initWidthSlider() {
        binding.sliderWidth.value = currentWidth
        binding.tvWidthValue.text = currentWidth.toInt().toString()

        // Rotate slider to vertical after layout is measured
        binding.sliderContainer.post {
            val containerHeight = binding.sliderContainer.height
            val containerWidth = binding.sliderContainer.width

            // Rotate slider 270° (so dragging up increases value)
            binding.sliderWidth.rotation = 270f

            // After rotation, slider's width becomes visual height
            // Set slider width to match container height so it fills vertically
            val layoutParams = binding.sliderWidth.layoutParams
            layoutParams.width = containerHeight
            layoutParams.height = containerWidth
            binding.sliderWidth.layoutParams = layoutParams
        }

        binding.sliderWidth.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                Log.d(TAG, "Width changed: $value")
                currentWidth = value
                paint.strokeWidth = value

                booxDrawingHelper?.setStrokeWidth(value)

                // Pause render to update UI, then resume
                booxDrawingHelper?.pauseForUiRefresh {
                    binding.tvWidthValue.text = value.toInt().toString()
                } ?: run {
                    binding.tvWidthValue.text = value.toInt().toString()
                }
            }
        }
    }

    /**
     * Select a brush style.
     */
    private fun selectBrush(style: Int, name: String) {
        Log.i(TAG, "selectBrush: style=$style ($name)")

        currentStyle = style
        binding.tvBrushName.text = name

        // Update the stroke style on TouchHelper (no need to disable/enable)
        booxDrawingHelper?.setStrokeStyle(style)

        // Pause render, update UI, then resume render
        booxDrawingHelper?.pauseForUiRefresh {
            updateBrushButtonStates()
            // Re-render our bitmap to restore previous strokes on screen
            renderBitmapToSurface()
        } ?: run {
            // No helper (fallback mode), just update directly
            updateBrushButtonStates()
            renderBitmapToSurface()
        }
    }

    /**
     * Update the visual state of brush buttons to reflect current selection.
     */
    private fun updateBrushButtonStates() {
        brushButtons.forEach { (style, button) ->
            val isSelected = style == currentStyle
            if (isSelected) {
                button.setBackgroundColor(Color.parseColor("#D0D0D0"))
                button.strokeWidth = 0
            } else {
                button.setBackgroundColor(Color.TRANSPARENT)
                button.strokeWidth = (1 * resources.displayMetrics.density).toInt() // 1dp
            }
        }
    }

    /**
     * Select a color.
     */
    private fun selectColor(index: Int, color: Int) {
        Log.i(TAG, "selectColor: index=$index, color=${Integer.toHexString(color)}")

        currentColor = color
        paint.color = color

        // Update SDK stroke color (no need to disable/enable)
        booxDrawingHelper?.setStrokeColor(color)

        // Pause render, update UI, then resume render
        booxDrawingHelper?.pauseForUiRefresh {
            updateColorButtonStates()
            // Re-render our bitmap to restore previous strokes on screen
            renderBitmapToSurface()
        } ?: run {
            // No helper (fallback mode), just update directly
            updateColorButtonStates()
            renderBitmapToSurface()
        }
    }

    /**
     * Update the visual state of color buttons to reflect current selection.
     */
    private fun updateColorButtonStates() {
        val strokeWidth = (3 * resources.displayMetrics.density).toInt()
        val normalStrokeWidth = (1 * resources.displayMetrics.density).toInt()

        for ((index, view) in colorButtons.withIndex()) {
            val color = KALEIDO_COLORS[index]
            val isSelected = color == currentColor

            (view.background as? android.graphics.drawable.GradientDrawable)?.apply {
                if (isSelected) {
                    setStroke(strokeWidth, Color.parseColor("#1976D2")) // Blue highlight for selected
                } else {
                    setStroke(normalStrokeWidth, Color.parseColor("#888888"))
                }
            }
        }
    }

    /**
     * Clear the canvas.
     */
    private fun clearCanvas() {
        Log.d(TAG, "clearCanvas: Clearing canvas to white and stored strokes")
        strokes.clear()
        canvas?.drawColor(Color.WHITE)
        renderBitmapToSurface()
        hasDrawn = false
    }

    /**
     * Handle clear button with confirmation if user has drawn.
     */
    private fun handleClear() {
        if (hasDrawn) {
            AlertDialog.Builder(this)
                .setTitle("Clear Canvas")
                .setMessage("This will erase your drawing. Continue?")
                .setPositiveButton("Clear") { _, _ ->
                    clearCanvas()
                }
                .setNegativeButton("Cancel", null)
                .show()
        } else {
            clearCanvas()
        }
    }

    /**
     * Handle cancel - prompt if user has drawn.
     */
    private fun handleCancel() {
        if (hasDrawn) {
            AlertDialog.Builder(this)
                .setTitle("Discard Drawing")
                .setMessage("You have unsaved changes. Discard?")
                .setPositiveButton("Discard") { _, _ ->
                    cancelAndClose()
                }
                .setNegativeButton("Keep Drawing", null)
                .show()
        } else {
            cancelAndClose()
        }
    }

    /**
     * Cancel and return to caller.
     */
    private fun cancelAndClose() {
        Log.i(TAG, "cancelAndClose: Returning CANCELLED result")
        setResult(RESULT_DRAWING_CANCELLED)
        finish()
    }

    /**
     * Handle done - export bitmap and return to caller.
     */
    private fun handleDone() {
        Log.i(TAG, "handleDone: Starting export...")

        if (!hasDrawn) {
            Log.w(TAG, "handleDone: Nothing drawn, returning empty result")
            setResult(RESULT_DRAWING_CANCELLED)
            finish()
            return
        }

        showLoading("Exporting drawing...")

        // Export on background thread
        Thread {
            try {
                val pngBytes = exportToPng()
                Log.i(TAG, "handleDone: Exported ${pngBytes.size} bytes")

                runOnUiThread {
                    hideLoading()

                    val resultIntent = Intent().apply {
                        putExtra(EXTRA_DRAWING_PNG, pngBytes)
                        putExtra(EXTRA_DRAWING_WIDTH, bitmap?.width ?: 0)
                        putExtra(EXTRA_DRAWING_HEIGHT, bitmap?.height ?: 0)
                    }

                    Log.i(TAG, "handleDone: Returning successful result")
                    setResult(RESULT_DRAWING_COMPLETE, resultIntent)
                    finish()
                }
            } catch (e: Exception) {
                Log.e(TAG, "handleDone: Export failed", e)

                runOnUiThread {
                    hideLoading()
                    AlertDialog.Builder(this)
                        .setTitle("Export Failed")
                        .setMessage("Failed to export drawing: ${e.message}")
                        .setPositiveButton("OK", null)
                        .show()
                }
            }
        }.start()
    }

    /**
     * Export the current bitmap to PNG bytes.
     */
    private fun exportToPng(): ByteArray {
        Log.d(TAG, "exportToPng: Starting compression...")

        val localBitmap = bitmap ?: throw IllegalStateException("No bitmap to export")

        val stream = ByteArrayOutputStream()
        localBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)

        val bytes = stream.toByteArray()
        Log.d(TAG, "exportToPng: Compressed to ${bytes.size} bytes")

        return bytes
    }

    /**
     * Show loading overlay.
     */
    private fun showLoading(message: String) {
        binding.tvLoadingMessage.text = message
        binding.loadingOverlay.visibility = View.VISIBLE
    }

    /**
     * Hide loading overlay.
     */
    private fun hideLoading() {
        binding.loadingOverlay.visibility = View.GONE
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy: Cleaning up resources")

        booxDrawingHelper?.closeDrawing()
        booxDrawingHelper = null

        bitmap?.recycle()
        bitmap = null
        canvas = null

        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        Log.d(TAG, "onBackPressed")
        handleCancel()
    }
}

/**
 * Data class for touch points from the Boox SDK.
 */
data class BooxTouchPoint(
    val x: Float,
    val y: Float,
    val pressure: Float,
    val size: Float,
    val timestamp: Long
)

/**
 * Helper class to wrap Boox SDK TouchHelper.
 *
 * This class directly uses the SDK classes since they are bundled with the app.
 * It is only instantiated after capability detection confirms SDK availability.
 */
class BooxDrawingHelper(
    private val surfaceView: android.view.SurfaceView,
    private val onStrokeComplete: (List<BooxTouchPoint>) -> Unit
) {
    companion object {
        private const val TAG = "BooxDrawingHelper"
    }

    // Direct reference to TouchHelper (SDK is bundled)
    private var touchHelper: com.onyx.android.sdk.pen.TouchHelper? = null
    private var isOpen = false

    init {
        Log.d(TAG, "BooxDrawingHelper: Initializing...")
    }

    /**
     * Open drawing mode with the given bounds and exclude rectangles.
     */
    fun openDrawing(bounds: Rect, excludeRects: List<Rect> = emptyList()) {
        Log.i(TAG, "openDrawing: bounds=${bounds.left},${bounds.top}-${bounds.right},${bounds.bottom} (${bounds.width()}x${bounds.height()}), excludeRects ignored")

        try {
            // Create callback implementation
            val callback = object : com.onyx.android.sdk.pen.RawInputCallback() {
                override fun onBeginRawDrawing(b: Boolean, touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onBeginRawDrawing")
                }

                override fun onRawDrawingTouchPointMoveReceived(touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onRawDrawingTouchPointMoveReceived")
                }

                override fun onRawDrawingTouchPointListReceived(touchPointList: com.onyx.android.sdk.pen.data.TouchPointList?) {
                    Log.d(TAG, "RawInputCallback: onRawDrawingTouchPointListReceived")
                    touchPointList?.let {
                        val points = extractTouchPoints(it)
                        onStrokeComplete(points)
                    }
                }

                override fun onEndRawDrawing(b: Boolean, touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onEndRawDrawing")
                }

                override fun onBeginRawErasing(b: Boolean, touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onBeginRawErasing")
                }

                override fun onRawErasingTouchPointMoveReceived(touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onRawErasingTouchPointMoveReceived")
                }

                override fun onRawErasingTouchPointListReceived(touchPointList: com.onyx.android.sdk.pen.data.TouchPointList?) {
                    Log.d(TAG, "RawInputCallback: onRawErasingTouchPointListReceived")
                }

                override fun onEndRawErasing(b: Boolean, touchPoint: com.onyx.android.sdk.data.note.TouchPoint?) {
                    Log.v(TAG, "RawInputCallback: onEndRawErasing")
                }
            }

            // Create TouchHelper
            touchHelper = com.onyx.android.sdk.pen.TouchHelper.create(surfaceView, callback)
            Log.d(TAG, "openDrawing: TouchHelper created: $touchHelper")

            touchHelper?.apply {
                setStrokeWidth(3.0f)

                // Set limit rect to ONLY the drawing area - no exclude rects needed
                // The bounds define where touch input is captured; touches outside are ignored
                // This prevents the EPD/TouchHelper from intercepting toolbar touches
                Log.d(TAG, "openDrawing: Setting limit rect to bounds only: ${bounds.left},${bounds.top} - ${bounds.right},${bounds.bottom}")
                setLimitRect(bounds, emptyList())

                openRawDrawing()
                setRawDrawingEnabled(true)

                // Enable native rendering for smooth, low-latency strokes
                try {
                    setRawDrawingRenderEnabled(true)
                    Log.i(TAG, "openDrawing: Native EPD rendering enabled!")
                } catch (e: Exception) {
                    Log.w(TAG, "openDrawing: setRawDrawingRenderEnabled not available", e)
                }
            }

            isOpen = true
            Log.i(TAG, "openDrawing: Successfully opened native drawing mode!")

        } catch (e: Exception) {
            Log.e(TAG, "openDrawing: Failed to initialize TouchHelper", e)
            throw e
        }
    }

    /**
     * Extract touch points from SDK TouchPointList.
     */
    private fun extractTouchPoints(touchPointList: com.onyx.android.sdk.pen.data.TouchPointList): List<BooxTouchPoint> {
        val points = mutableListOf<BooxTouchPoint>()

        try {
            val rawPoints = touchPointList.points ?: return points
            Log.d(TAG, "extractTouchPoints: Found ${rawPoints.size} points")

            for (rawPoint in rawPoints) {
                points.add(BooxTouchPoint(
                    x = rawPoint.x,
                    y = rawPoint.y,
                    pressure = rawPoint.pressure,
                    size = rawPoint.size,
                    timestamp = rawPoint.timestamp
                ))
            }

            Log.d(TAG, "extractTouchPoints: Extracted ${points.size} points")
        } catch (e: Exception) {
            Log.e(TAG, "extractTouchPoints: Failed to extract points", e)
        }

        return points
    }

    /**
     * Set stroke width.
     */
    fun setStrokeWidth(width: Float) {
        Log.d(TAG, "setStrokeWidth: $width")
        touchHelper?.setStrokeWidth(width)
    }

    /**
     * Set stroke style.
     */
    fun setStrokeStyle(style: Int) {
        Log.d(TAG, "setStrokeStyle: $style")
        touchHelper?.setStrokeStyle(style)
    }

    /**
     * Set stroke color.
     */
    fun setStrokeColor(color: Int) {
        Log.d(TAG, "setStrokeColor: ${Integer.toHexString(color)}")
        touchHelper?.setStrokeColor(color)
    }

    /**
     * Enable or disable drawing.
     */
    fun setDrawingEnabled(enabled: Boolean) {
        Log.d(TAG, "setDrawingEnabled: $enabled")
        touchHelper?.setRawDrawingEnabled(enabled)
    }

    /**
     * Temporarily pause raw drawing render to allow UI refresh, then resume.
     * This is needed because raw render mode takes over the entire screen refresh.
     */
    fun pauseForUiRefresh(onPaused: () -> Unit) {
        Log.d(TAG, "pauseForUiRefresh: Pausing render...")
        try {
            touchHelper?.setRawDrawingRenderEnabled(false)
            // Give the system a moment to do a normal refresh
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                onPaused()
                // Small delay to let the UI update render
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    touchHelper?.setRawDrawingRenderEnabled(true)
                    Log.d(TAG, "pauseForUiRefresh: Render resumed")
                }, 50)
            }, 10)
        } catch (e: Exception) {
            Log.w(TAG, "pauseForUiRefresh: Failed", e)
            onPaused() // Still call the callback
        }
    }

    /**
     * Close drawing mode and release resources.
     */
    fun closeDrawing() {
        Log.i(TAG, "closeDrawing: Releasing resources...")

        if (!isOpen) {
            Log.d(TAG, "closeDrawing: Not open, skipping")
            return
        }

        try {
            touchHelper?.closeRawDrawing()
            isOpen = false
            Log.i(TAG, "closeDrawing: Successfully closed")
        } catch (e: Exception) {
            Log.e(TAG, "closeDrawing: Failed", e)
        }

        touchHelper = null
    }
}

/**
 * Data class to store stroke information for re-rendering.
 */
data class StrokeData(
    val points: List<BooxTouchPoint>,
    val style: Int,
    val color: Int,
    val width: Float
)

/**
 * Brush renderer that uses the Boox SDK pen classes for rendering.
 * This ensures the exported bitmap matches what the user sees during native EPD drawing.
 */
object BrushRenderer {
    private const val TAG = "BrushRenderer"

    // Cache max pressure value
    private var cachedMaxPressure: Float = 0f

    /**
     * Get max touch pressure from SDK.
     */
    private fun getMaxPressure(): Float {
        if (cachedMaxPressure <= 0f) {
            try {
                cachedMaxPressure = com.onyx.android.sdk.api.device.epd.EpdController.getMaxTouchPressure()
                Log.d(TAG, "getMaxPressure: $cachedMaxPressure")
            } catch (e: Exception) {
                Log.w(TAG, "getMaxPressure: Failed to get from SDK, using default", e)
                cachedMaxPressure = 4096f // Common default
            }
        }
        return cachedMaxPressure
    }

    /**
     * Convert our BooxTouchPoint list to SDK TouchPoint list.
     */
    private fun toSdkTouchPoints(points: List<BooxTouchPoint>): List<com.onyx.android.sdk.data.note.TouchPoint> {
        return points.map { pt ->
            com.onyx.android.sdk.data.note.TouchPoint(pt.x, pt.y, pt.pressure, pt.size, pt.timestamp)
        }
    }

    /**
     * Create a properly configured paint for the stroke.
     */
    private fun createPaint(color: Int): Paint {
        return Paint().apply {
            isAntiAlias = true
            isDither = true
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeMiter = 4.0f
            this.color = color
        }
    }

    /**
     * Render a stroke with the appropriate brush style using SDK pen classes.
     */
    fun renderStroke(canvas: Canvas, stroke: StrokeData) {
        if (stroke.points.isEmpty()) return

        Log.d(TAG, "renderStroke: style=${stroke.style}, points=${stroke.points.size}, color=${Integer.toHexString(stroke.color)}, width=${stroke.width}")

        try {
            when (stroke.style) {
                BooxDrawingActivity.STYLE_PENCIL -> renderPencilStroke(canvas, stroke)
                BooxDrawingActivity.STYLE_FOUNTAIN -> renderFountainStroke(canvas, stroke)
                BooxDrawingActivity.STYLE_NEO_BRUSH -> renderNeoBrushStroke(canvas, stroke)
                BooxDrawingActivity.STYLE_MARKER -> renderMarkerStroke(canvas, stroke)
                BooxDrawingActivity.STYLE_CHARCOAL -> renderCharcoalStroke(canvas, stroke)
                else -> renderFountainStroke(canvas, stroke) // Default
            }
        } catch (e: Exception) {
            Log.e(TAG, "renderStroke: SDK rendering failed, using fallback", e)
            renderFallbackStroke(canvas, stroke)
        }
    }

    /**
     * Pencil: Simple path-based rendering with consistent width.
     */
    private fun renderPencilStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color).apply {
            strokeWidth = stroke.width
        }

        val sdkPoints = toSdkTouchPoints(stroke.points)

        if (sdkPoints.size == 1) {
            paint.style = Paint.Style.FILL
            canvas.drawCircle(sdkPoints[0].x, sdkPoints[0].y, stroke.width / 2, paint)
            return
        }

        val path = Path()
        path.moveTo(sdkPoints[0].x, sdkPoints[0].y)

        for (i in 1 until sdkPoints.size) {
            val prev = sdkPoints[i - 1]
            val curr = sdkPoints[i]
            path.quadTo(prev.x, prev.y, curr.x, curr.y)
        }

        canvas.drawPath(path, paint)
    }

    /**
     * Fountain Pen: Use SDK NeoFountainPen for pressure-sensitive calligraphy strokes.
     */
    private fun renderFountainStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points)
        val maxPressure = getMaxPressure()

        try {
            // Use SDK's NeoFountainPen for accurate rendering
            com.onyx.android.sdk.pen.NeoFountainPen.drawStroke(
                canvas,
                paint,
                sdkPoints,
                1.0f, // density
                stroke.width,
                maxPressure,
                false // not erasing
            )
        } catch (e: Exception) {
            Log.w(TAG, "renderFountainStroke: SDK failed, using fallback", e)
            renderFallbackStroke(canvas, stroke)
        }
    }

    /**
     * Neo Brush: Use SDK NeoBrushPen for dynamic brush strokes.
     */
    private fun renderNeoBrushStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points)
        val maxPressure = getMaxPressure()

        try {
            // Use SDK's NeoBrushPen
            val brushPoints = com.onyx.android.sdk.pen.NeoBrushPen.computeStrokePoints(
                sdkPoints,
                stroke.width,
                maxPressure
            )
            com.onyx.android.sdk.pen.PenUtils.drawStrokeByPointSize(canvas, paint, brushPoints, false)
        } catch (e: Exception) {
            Log.w(TAG, "renderNeoBrushStroke: SDK failed, using fallback", e)
            renderFallbackStroke(canvas, stroke)
        }
    }

    /**
     * Marker: Use SDK NeoMarkerPen for semi-transparent highlighter strokes.
     */
    private fun renderMarkerStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points)
        val maxPressure = getMaxPressure()

        try {
            // Use SDK's NeoMarkerPen
            val markerPoints = com.onyx.android.sdk.pen.NeoMarkerPen.computeStrokePoints(
                sdkPoints,
                stroke.width,
                maxPressure
            )
            com.onyx.android.sdk.pen.NeoMarkerPen.drawStroke(canvas, paint, markerPoints, stroke.width, true)
        } catch (e: Exception) {
            Log.w(TAG, "renderMarkerStroke: SDK failed, using fallback", e)
            renderFallbackStroke(canvas, stroke)
        }
    }

    /**
     * Charcoal: Use SDK NeoCharcoalPenV2 for textured charcoal strokes.
     * Falls back to pressure-sensitive thick strokes if SDK rendering fails.
     */
    private fun renderCharcoalStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points)

        Log.d(TAG, "renderCharcoalStroke: Rendering ${sdkPoints.size} points with width=${stroke.width}")

        try {
            // Try SDK's NeoCharcoalPenV2
            val createArgs = com.onyx.android.sdk.data.note.ShapeCreateArgs()
            val renderArgs = com.onyx.android.sdk.pen.PenRenderArgs()
                .setCreateArgs(createArgs)
                .setCanvas(canvas)
                .setPenType(com.onyx.android.sdk.pen.NeoPenConfig.NEOPEN_PEN_TYPE_CHARCOAL)
                .setColor(stroke.color)
                .setErase(false)
                .setPaint(paint)
                .setStrokeWidth(stroke.width)
                .setPoints(sdkPoints)

            com.onyx.android.sdk.pen.NeoCharcoalPenV2.drawNormalStroke(renderArgs)
            Log.d(TAG, "renderCharcoalStroke: SDK rendering succeeded")
        } catch (e: Exception) {
            Log.w(TAG, "renderCharcoalStroke: SDK failed (${e.message}), using charcoal fallback")
            // Custom charcoal fallback - thick textured strokes
            renderCharcoalFallback(canvas, stroke)
        }
    }

    /**
     * Charcoal fallback: Simulates charcoal texture with multiple overlapping strokes.
     */
    private fun renderCharcoalFallback(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val points = stroke.points

        if (points.isEmpty()) return

        if (points.size == 1) {
            paint.style = Paint.Style.FILL
            val pt = points[0]
            val radius = stroke.width * 1.5f * pt.pressure.coerceIn(0.3f, 1.0f)
            canvas.drawCircle(pt.x, pt.y, radius, paint)
            return
        }

        // Charcoal: thick pressure-sensitive strokes with texture
        for (i in 0 until points.size - 1) {
            val p1 = points[i]
            val p2 = points[i + 1]

            val avgPressure = ((p1.pressure + p2.pressure) / 2).coerceIn(0.3f, 1.0f)
            val baseWidth = stroke.width * 2.5f * avgPressure

            // Main stroke
            paint.strokeWidth = baseWidth
            paint.alpha = 220
            canvas.drawLine(p1.x, p1.y, p2.x, p2.y, paint)

            // Add texture with offset strokes
            paint.strokeWidth = baseWidth * 0.4f
            paint.alpha = 120

            val offset1 = ((p1.x.toInt() % 5) - 2).toFloat()
            val offset2 = ((p1.y.toInt() % 5) - 2).toFloat()
            canvas.drawLine(p1.x + offset1, p1.y + offset2, p2.x + offset1, p2.y + offset2, paint)

            val offset3 = ((p1.x.toInt() % 7) - 3).toFloat()
            val offset4 = ((p1.y.toInt() % 7) - 3).toFloat()
            canvas.drawLine(p1.x + offset3, p1.y - offset4, p2.x + offset3, p2.y - offset4, paint)
        }
    }

    /**
     * Fallback stroke rendering when SDK classes fail.
     */
    private fun renderFallbackStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color).apply {
            strokeWidth = stroke.width
        }

        val points = stroke.points

        if (points.size == 1) {
            paint.style = Paint.Style.FILL
            canvas.drawCircle(points[0].x, points[0].y, stroke.width / 2, paint)
            return
        }

        // Draw pressure-sensitive segments
        for (i in 0 until points.size - 1) {
            val p1 = points[i]
            val p2 = points[i + 1]
            val avgPressure = ((p1.pressure + p2.pressure) / 2).coerceIn(0.2f, 1.0f)
            paint.strokeWidth = stroke.width * avgPressure
            canvas.drawLine(p1.x, p1.y, p2.x, p2.y, paint)
        }
    }
}
