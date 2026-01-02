@file:Suppress("DEPRECATION")

package com.kazan.diagrammer.boox

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.SurfaceHolder
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.kazan.diagrammer.databinding.ActivityBooxDrawingBinding
import java.io.ByteArrayOutputStream

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
     * This includes the top toolbar and bottom control panel.
     */
    private fun calculateExcludeRects(): List<Rect> {
        val excludeRects = mutableListOf<Rect>()

        // Get screen location of SurfaceView for coordinate conversion
        val surfaceLocation = IntArray(2)
        binding.surfaceView.getLocationOnScreen(surfaceLocation)

        // Top toolbar exclude rect
        val topToolbarLocation = IntArray(2)
        binding.toolbar.getLocationOnScreen(topToolbarLocation)
        val topRect = Rect(
            topToolbarLocation[0] - surfaceLocation[0],
            topToolbarLocation[1] - surfaceLocation[1],
            topToolbarLocation[0] - surfaceLocation[0] + binding.toolbar.width,
            topToolbarLocation[1] - surfaceLocation[1] + binding.toolbar.height
        )
        excludeRects.add(topRect)
        Log.d(TAG, "calculateExcludeRects: Top toolbar rect = $topRect")

        // Bottom toolbar exclude rect
        val bottomToolbarLocation = IntArray(2)
        binding.bottomToolbar.getLocationOnScreen(bottomToolbarLocation)
        val bottomRect = Rect(
            bottomToolbarLocation[0] - surfaceLocation[0],
            bottomToolbarLocation[1] - surfaceLocation[1],
            bottomToolbarLocation[0] - surfaceLocation[0] + binding.bottomToolbar.width,
            bottomToolbarLocation[1] - surfaceLocation[1] + binding.bottomToolbar.height
        )
        excludeRects.add(bottomRect)
        Log.d(TAG, "calculateExcludeRects: Bottom toolbar rect = $bottomRect")

        return excludeRects
    }

    /**
     * Calculate the drawing bounds (the area between toolbars where drawing is allowed).
     */
    private fun calculateDrawingBounds(): Rect {
        // Get SurfaceView dimensions
        val surfaceRect = Rect()
        binding.surfaceView.getLocalVisibleRect(surfaceRect)

        // Get screen locations
        val surfaceLocation = IntArray(2)
        binding.surfaceView.getLocationOnScreen(surfaceLocation)

        val topToolbarLocation = IntArray(2)
        binding.toolbar.getLocationOnScreen(topToolbarLocation)
        val topToolbarBottom = topToolbarLocation[1] + binding.toolbar.height - surfaceLocation[1]

        val bottomToolbarLocation = IntArray(2)
        binding.bottomToolbar.getLocationOnScreen(bottomToolbarLocation)
        val bottomToolbarTop = bottomToolbarLocation[1] - surfaceLocation[1]

        // Drawing area is between the toolbars
        return Rect(
            0,
            topToolbarBottom.coerceAtLeast(0),
            surfaceRect.width(),
            bottomToolbarTop.coerceAtMost(surfaceRect.height())
        )
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
     */
    private fun onNativeStrokeComplete(points: List<BooxTouchPoint>) {
        Log.d(TAG, "onNativeStrokeComplete: Received ${points.size} points")

        if (points.isEmpty()) return

        hasDrawn = true

        // Draw the stroke to our bitmap
        val localCanvas = canvas ?: return

        if (points.size == 1) {
            // Single point - draw a dot
            val pt = points[0]
            val radius = (currentWidth / 2) * pt.pressure.coerceIn(0.2f, 1.0f)
            localCanvas.drawCircle(pt.x, pt.y, radius, paint)
        } else {
            // Multiple points - draw smooth curve using quadratic bezier
            val path = android.graphics.Path()
            val firstPt = points[0]
            path.moveTo(firstPt.x, firstPt.y)

            if (points.size == 2) {
                // Only 2 points - draw a line
                path.lineTo(points[1].x, points[1].y)
            } else {
                // Use quadratic bezier curves for smooth strokes
                // Each segment uses the current point as control and midpoint to next as end
                for (i in 1 until points.size - 1) {
                    val current = points[i]
                    val next = points[i + 1]
                    val midX = (current.x + next.x) / 2f
                    val midY = (current.y + next.y) / 2f
                    path.quadTo(current.x, current.y, midX, midY)
                }
                // Connect to the last point
                val lastPt = points.last()
                val secondLast = points[points.size - 2]
                path.quadTo(secondLast.x, secondLast.y, lastPt.x, lastPt.y)
            }

            localCanvas.drawPath(path, paint)
        }

        // Update the surface display
        renderBitmapToSurface()
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
     * Initialize the color selection buttons dynamically.
     */
    private fun initColorButtons() {
        val colorContainer = binding.colorContainer
        colorContainer.removeAllViews()
        colorButtons.clear()

        val buttonSize = (32 * resources.displayMetrics.density).toInt()
        val margin = (4 * resources.displayMetrics.density).toInt()

        for ((index, color) in KALEIDO_COLORS.withIndex()) {
            val colorView = View(this).apply {
                layoutParams = android.widget.LinearLayout.LayoutParams(buttonSize, buttonSize).apply {
                    setMargins(margin, margin, margin, margin)
                }
                setBackgroundColor(color)

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
     */
    private fun initWidthSlider() {
        binding.sliderWidth.value = currentWidth
        binding.tvWidthValue.text = currentWidth.toInt().toString()

        binding.sliderWidth.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                Log.d(TAG, "Width changed: $value")
                currentWidth = value
                paint.strokeWidth = value
                binding.tvWidthValue.text = value.toInt().toString()

                booxDrawingHelper?.setStrokeWidth(value)
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

        // Temporarily disable drawing while changing style
        booxDrawingHelper?.setDrawingEnabled(false)
        booxDrawingHelper?.setStrokeStyle(style)
        booxDrawingHelper?.setDrawingEnabled(true)

        updateBrushButtonStates()
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

        // Update SDK stroke color
        booxDrawingHelper?.setDrawingEnabled(false)
        booxDrawingHelper?.setStrokeColor(color)
        booxDrawingHelper?.setDrawingEnabled(true)

        updateColorButtonStates()
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
        Log.d(TAG, "clearCanvas: Clearing canvas to white")
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
        Log.i(TAG, "openDrawing: bounds=${bounds.width()}x${bounds.height()}, excludeRects=${excludeRects.size}")

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

                // Set limit rect with exclude areas for UI elements
                // The exclude rects tell the SDK to NOT capture touch input in those areas
                Log.d(TAG, "openDrawing: Setting limit rect with ${excludeRects.size} exclude areas")
                setLimitRect(bounds, excludeRects)

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
