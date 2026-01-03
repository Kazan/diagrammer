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
        const val EXTRA_DRAWING_URI = "drawing_uri"  // File-based transfer for large drawings (Issue #2 fix)
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

        // Stroke width range
        const val MIN_STROKE_WIDTH = 1f
        const val MAX_STROKE_WIDTH = 50f

        /**
         * Default stroke widths per brush type.
         * These are tuned for natural-looking strokes with each brush.
         */
        val DEFAULT_STROKE_WIDTHS = mapOf(
            STYLE_PENCIL to 3f,      // Thin, precise
            STYLE_FOUNTAIN to 5f,    // Medium, calligraphy
            STYLE_NEO_BRUSH to 8f,   // Broader, painterly
            STYLE_MARKER to 15f,     // Wide highlighter
            STYLE_CHARCOAL to 12f    // Thick, textured
        )

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
    private var currentWidth = DEFAULT_STROKE_WIDTHS[STYLE_FOUNTAIN] ?: 5f
    private var currentColor = Color.BLACK
    private var hasDrawn = false

    // Stored strokes for proper re-rendering with brush styles
    private val strokes = mutableListOf<StrokeData>()

    // Color buttons for easy iteration
    private val colorButtons = mutableListOf<View>()

    // Boox SDK wrapper (null on non-Boox devices)
    private var booxDrawingHelper: BooxDrawingHelper? = null

    // Device receiver for system events (notification panel, screen on)
    private var deviceReceiver: GlobalDeviceReceiver? = null

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
                    // IMPORTANT: openDrawing must be called FIRST to create the TouchHelper
                    // Only after that can we configure stroke width, style, and color
                    openDrawing(drawingBounds, excludeRects)
                    setStrokeWidth(currentWidth)
                    setStrokeStyle(currentStyle)
                    setStrokeColor(currentColor)
                }
                Log.i(TAG, "initializeDrawingAfterLayout: Boox TouchHelper initialized successfully!")

                // Initialize device receiver for system gesture detection
                initializeDeviceReceiver()
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
     * Initialize the device receiver for system events.
     * This allows us to detect when the system notification panel opens
     * and automatically disable raw drawing to allow system gestures.
     */
    private fun initializeDeviceReceiver() {
        Log.d(TAG, "initializeDeviceReceiver: Setting up system event listener...")
        try {
            deviceReceiver = GlobalDeviceReceiver().apply {
                setSystemNotificationPanelChangeListener { isPanelOpen ->
                    Log.d(TAG, "System notification panel changed: open=$isPanelOpen")
                    if (isPanelOpen) {
                        // Disable drawing when system panel opens
                        booxDrawingHelper?.setDrawingEnabled(false)
                    } else {
                        // Re-enable drawing and restore bitmap when panel closes
                        renderBitmapToSurface()
                        booxDrawingHelper?.setDrawingEnabled(true)
                    }
                }
                setSystemScreenOnListener {
                    Log.d(TAG, "System screen turned on")
                    // Re-render bitmap when screen turns on
                    renderBitmapToSurface()
                }
                // Enable the receiver
                enable(this@BooxDrawingActivity, true)
            }
            Log.i(TAG, "initializeDeviceReceiver: Device receiver initialized")
        } catch (e: Exception) {
            Log.w(TAG, "initializeDeviceReceiver: Failed to initialize device receiver", e)
            // Continue without device receiver - system gestures may not work perfectly
        }
    }

    /**
     * Calculate exclude rectangles for UI areas that should not receive stylus input.
     * With left sidebar layout, we exclude:
     * - The sidebar
     * - The bottom action bar
     * - The system status bar area (to allow system gestures like swipe-down)
     *
     * These exclusions allow the user to interact with UI elements and system
     * menus while drawing is active.
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

        // System status bar exclusion zone at the top of the screen
        // This allows the user to swipe down from the top to access system menus
        // The status bar area extends from the top of the screen, so we calculate
        // it relative to the SurfaceView's position
        val statusBarHeight = getStatusBarHeight()
        if (statusBarHeight > 0) {
            // Create an exclusion zone that extends above the SurfaceView
            // Since the SurfaceView might be positioned below the status bar,
            // we need to include that area in view-local coordinates
            val topExcludeHeight = maxOf(0, statusBarHeight - surfaceLocation[1])
            if (topExcludeHeight > 0) {
                val statusBarRect = Rect(
                    0,
                    -surfaceLocation[1],  // Start from top of screen in surface-local coords
                    binding.surfaceView.width,
                    topExcludeHeight
                )
                excludeRects.add(statusBarRect)
                Log.d(TAG, "calculateExcludeRects: Status bar rect = $statusBarRect (statusBarHeight=$statusBarHeight)")
            }

            // Also add a "gesture zone" at the very top of the SurfaceView
            // to make it easier to trigger system swipe gestures
            val gestureZoneHeight = (48 * resources.displayMetrics.density).toInt()
            val gestureZoneRect = Rect(
                0,
                0,
                binding.surfaceView.width,
                gestureZoneHeight
            )
            excludeRects.add(gestureZoneRect)
            Log.d(TAG, "calculateExcludeRects: Top gesture zone rect = $gestureZoneRect")
        }

        return excludeRects
    }

    /**
     * Get the system status bar height.
     */
    private fun getStatusBarHeight(): Int {
        val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resourceId > 0) {
            resources.getDimensionPixelSize(resourceId)
        } else {
            // Fallback to a reasonable default (24dp)
            (24 * resources.displayMetrics.density).toInt()
        }
    }

    /**
     * Calculate the drawing bounds (the SurfaceView area where drawing is allowed).
     *
     * Uses simple view-local coordinates (0,0 to width,height) with a small margin.
     * The SDK handles coordinate transformation internally.
     *
     * Note: We keep the bounds simple here. Exclusion of UI areas is handled
     * separately via calculateExcludeRects() which excludes sidebar, action bar,
     * and system UI areas.
     */
    private fun calculateDrawingBounds(): Rect {
        // Use simple view-local coordinates (0,0 origin)
        // This matches how notable and saber-notes configure their bounds
        val bounds = Rect(0, 0, binding.surfaceView.width, binding.surfaceView.height)

        Log.d(TAG, "calculateDrawingBounds: Full bounds = ${bounds.left},${bounds.top} - ${bounds.right},${bounds.bottom}")

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
        // Track current stroke points for proper cancellation handling (Issue #6 fix)
        val currentStrokePoints = mutableListOf<Pair<Float, Float>>()

        binding.surfaceView.setOnTouchListener { _, event ->
            when (event.action) {
                android.view.MotionEvent.ACTION_DOWN -> {
                    lastX = event.x
                    lastY = event.y
                    currentStrokePoints.clear()
                    currentStrokePoints.add(lastX to lastY)
                    Log.v(TAG, "Touch DOWN: ($lastX, $lastY)")
                    true
                }
                android.view.MotionEvent.ACTION_MOVE -> {
                    val currentX = event.x
                    val currentY = event.y

                    // Draw line from last point to current
                    canvas?.drawLine(lastX, lastY, currentX, currentY, paint)
                    hasDrawn = true
                    currentStrokePoints.add(currentX to currentY)

                    // Update the surface
                    renderBitmapToSurface()

                    lastX = currentX
                    lastY = currentY
                    true
                }
                android.view.MotionEvent.ACTION_UP -> {
                    Log.v(TAG, "Touch UP: ($lastX, $lastY)")
                    currentStrokePoints.clear()
                    true
                }
                android.view.MotionEvent.ACTION_CANCEL -> {
                    // Handle touch cancellation (e.g., system steals touch for notification)
                    // Discard incomplete stroke by clearing tracking (Issue #6 fix)
                    Log.d(TAG, "Touch CANCELLED - discarding incomplete stroke")
                    currentStrokePoints.clear()
                    true
                }
                else -> false
            }
        }
    }

    /**
     * Render the current bitmap to the SurfaceView.
     * Draws a white background first since the bitmap is transparent for export.
     */
    private fun renderBitmapToSurface() {
        val holder = binding.surfaceView.holder
        val surfaceCanvas = holder.lockCanvas() ?: return
        try {
            // Draw white background first (bitmap is transparent for export)
            surfaceCanvas.drawColor(Color.WHITE)
            bitmap?.let { surfaceCanvas.drawBitmap(it, 0f, 0f, null) }
        } finally {
            holder.unlockCanvasAndPost(surfaceCanvas)
        }
    }

    /**
     * Handle stroke completion from native Boox SDK.
     * The points contain x, y, pressure, and timestamp data.
     *
     * With native EPD rendering enabled, the user already sees the stroke
     * on the e-ink display with ultra-low latency. Here we:
     * 1. Store the stroke data for later re-rendering if needed
     * 2. Render the stroke to our bitmap (for export)
     *
     * IMPORTANT: We do NOT update the SurfaceView or force EPD refresh here.
     * The native EPD preview remains visible, preserving the authentic brush
     * appearance. The bitmap is built up silently for export.
     *
     * The SurfaceView/bitmap is only displayed when:
     * - User clears the canvas
     * - Notification panel closes (re-render)
     * - Export happens
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

        // Render this stroke to our bitmap silently (for export)
        // Do NOT display to surface - let native EPD preview persist
        val localCanvas = canvas ?: return
        BrushRenderer.renderStroke(localCanvas, strokeData)

        // Native EPD preview stays visible - no surface update or EPD refresh
        Log.d(TAG, "onNativeStrokeComplete: Stroke added to bitmap, native EPD preserved")
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

        // Wider swatches that fill the horizontal space (2 columns)
        val buttonHeight = (28 * resources.displayMetrics.density).toInt()
        val horizontalMargin = (3 * resources.displayMetrics.density).toInt()
        val verticalMargin = (4 * resources.displayMetrics.density).toInt()

        for ((index, color) in KALEIDO_COLORS.withIndex()) {
            val colorView = View(this).apply {
                // Use columnWeight to make each swatch fill half the container width
                layoutParams = android.widget.GridLayout.LayoutParams().apply {
                    width = 0
                    height = buttonHeight
                    columnSpec = android.widget.GridLayout.spec(index % 2, 1f) // 1f weight
                    rowSpec = android.widget.GridLayout.spec(index / 2)
                    setMargins(horizontalMargin, verticalMargin, horizontalMargin, verticalMargin)
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
        // Set slider range
        binding.sliderWidth.valueFrom = MIN_STROKE_WIDTH
        binding.sliderWidth.valueTo = MAX_STROKE_WIDTH
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
                    // Re-render bitmap to restore previous strokes after pause clears native EPD
                    renderBitmapToSurface()
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

        // Set default width for this brush type
        val defaultWidth = DEFAULT_STROKE_WIDTHS[style] ?: currentWidth
        updateStrokeWidth(defaultWidth)

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
     * Update the stroke width and sync UI.
     */
    private fun updateStrokeWidth(width: Float) {
        currentWidth = width
        paint.strokeWidth = width
        binding.sliderWidth.value = width
        binding.tvWidthValue.text = width.toInt().toString()
        booxDrawingHelper?.setStrokeWidth(width)
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
        Log.d(TAG, "clearCanvas: Clearing canvas to transparent and stored strokes")
        strokes.clear()
        canvas?.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        renderBitmapToSurface()
        hasDrawn = false
    }

    /**
     * Handle clear button with confirmation if user has drawn.
     */
    private fun handleClear() {
        if (hasDrawn) {
            // Disable drawing so the dialog is accessible
            booxDrawingHelper?.setDrawingEnabled(false)

            AlertDialog.Builder(this)
                .setTitle("Clear Canvas")
                .setMessage("This will erase your drawing. Continue?")
                .setPositiveButton("Clear") { _, _ ->
                    clearCanvas()
                    // Re-enable drawing after clearing
                    booxDrawingHelper?.setDrawingEnabled(true)
                }
                .setNegativeButton("Cancel") { _, _ ->
                    // Re-enable drawing on cancel
                    booxDrawingHelper?.setDrawingEnabled(true)
                }
                .setOnCancelListener {
                    // Re-enable drawing if dialog is dismissed (e.g., back button)
                    booxDrawingHelper?.setDrawingEnabled(true)
                }
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
            // Disable drawing so the dialog is accessible
            booxDrawingHelper?.setDrawingEnabled(false)

            AlertDialog.Builder(this)
                .setTitle("Discard Drawing")
                .setMessage("You have unsaved changes. Discard?")
                .setPositiveButton("Discard") { _, _ ->
                    cancelAndClose()
                }
                .setNegativeButton("Keep Drawing") { _, _ ->
                    // Re-enable drawing on cancel
                    booxDrawingHelper?.setDrawingEnabled(true)
                }
                .setOnCancelListener {
                    // Re-enable drawing if dialog is dismissed (e.g., back button)
                    booxDrawingHelper?.setDrawingEnabled(true)
                }
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
     * Uses file-based transfer for large drawings to avoid TransactionTooLargeException (Issue #2 fix).
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
                val exportResult = exportToPng()
                Log.i(TAG, "handleDone: Exported ${exportResult.bytes.size} bytes (${exportResult.width}x${exportResult.height})")

                // Use file-based transfer for larger drawings to avoid TransactionTooLargeException
                // Android Intent limit is ~500KB; use file transfer for anything over 256KB to be safe
                val resultIntent = if (exportResult.bytes.size > 256 * 1024) {
                    Log.i(TAG, "handleDone: Using file-based transfer (${exportResult.bytes.size} bytes > 256KB)")
                    val tempFile = java.io.File(cacheDir, "drawing_${System.currentTimeMillis()}.png")
                    tempFile.writeBytes(exportResult.bytes)
                    Intent().apply {
                        putExtra(EXTRA_DRAWING_URI, android.net.Uri.fromFile(tempFile).toString())
                        putExtra(EXTRA_DRAWING_WIDTH, exportResult.width)
                        putExtra(EXTRA_DRAWING_HEIGHT, exportResult.height)
                    }
                } else {
                    Log.i(TAG, "handleDone: Using Intent extras (${exportResult.bytes.size} bytes)")
                    Intent().apply {
                        putExtra(EXTRA_DRAWING_PNG, exportResult.bytes)
                        putExtra(EXTRA_DRAWING_WIDTH, exportResult.width)
                        putExtra(EXTRA_DRAWING_HEIGHT, exportResult.height)
                    }
                }

                runOnUiThread {
                    hideLoading()
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
                        .setOnDismissListener {
                            // Re-enable drawing after dialog dismissed
                            booxDrawingHelper?.setDrawingEnabled(true)
                        }
                        .show()
                }
            }
        }.start()
    }

    /**
     * Calculate the bounding box of all strokes.
     * Returns null if no strokes exist.
     */
    private fun calculateStrokesBoundingBox(): Rect? {
        if (strokes.isEmpty()) return null

        var minX = Float.MAX_VALUE
        var minY = Float.MAX_VALUE
        var maxX = Float.MIN_VALUE
        var maxY = Float.MIN_VALUE

        for (stroke in strokes) {
            // Account for stroke width when calculating bounds
            val halfWidth = stroke.width / 2f + 2f // Add small margin

            for (point in stroke.points) {
                minX = minOf(minX, point.x - halfWidth)
                minY = minOf(minY, point.y - halfWidth)
                maxX = maxOf(maxX, point.x + halfWidth)
                maxY = maxOf(maxY, point.y + halfWidth)
            }
        }

        // Ensure bounds are valid
        if (minX >= maxX || minY >= maxY) return null

        // Clamp to bitmap bounds
        val bitmapWidth = bitmap?.width ?: return null
        val bitmapHeight = bitmap?.height ?: return null

        val left = maxOf(0, minX.toInt())
        val top = maxOf(0, minY.toInt())
        val right = minOf(bitmapWidth, maxX.toInt() + 1)
        val bottom = minOf(bitmapHeight, maxY.toInt() + 1)

        // Ensure we have a valid rectangle
        if (right <= left || bottom <= top) return null

        return Rect(left, top, right, bottom)
    }

    /**
     * Result of exporting the drawing to PNG.
     */
    private data class ExportResult(
        val bytes: ByteArray,
        val width: Int,
        val height: Int
    )

    /**
     * Export the current bitmap to PNG bytes, cropped to the drawn area.
     */
    private fun exportToPng(): ExportResult {
        Log.d(TAG, "exportToPng: Starting compression...")

        val localBitmap = bitmap ?: throw IllegalStateException("No bitmap to export")

        // Calculate bounding box of all strokes
        val bounds = calculateStrokesBoundingBox()

        val exportBitmap = if (bounds != null) {
            Log.d(TAG, "exportToPng: Cropping to bounds: ${bounds.left},${bounds.top} - ${bounds.right},${bounds.bottom} (${bounds.width()}x${bounds.height()})")
            // Crop bitmap to the drawn area
            Bitmap.createBitmap(
                localBitmap,
                bounds.left,
                bounds.top,
                bounds.width(),
                bounds.height()
            )
        } else {
            Log.d(TAG, "exportToPng: No bounds calculated, exporting full bitmap")
            localBitmap
        }

        val stream = ByteArrayOutputStream()
        exportBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)

        val width = exportBitmap.width
        val height = exportBitmap.height

        // Recycle cropped bitmap if it's a new one
        if (exportBitmap !== localBitmap) {
            exportBitmap.recycle()
        }

        val bytes = stream.toByteArray()
        Log.d(TAG, "exportToPng: Compressed to ${bytes.size} bytes (${width}x${height})")

        return ExportResult(bytes, width, height)
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

        // Disable device receiver
        try {
            deviceReceiver?.enable(this, false)
        } catch (e: Exception) {
            Log.w(TAG, "onDestroy: Failed to disable device receiver", e)
        }
        deviceReceiver = null

        booxDrawingHelper?.closeDrawing()
        booxDrawingHelper = null

        bitmap?.recycle()
        bitmap = null
        canvas = null

        super.onDestroy()
    }

    /**
     * Pause device receiver when activity goes to background (Issue #5 fix).
     * This prevents receiving broadcasts and wasting battery when not visible.
     */
    override fun onPause() {
        super.onPause()
        try {
            deviceReceiver?.enable(this, false)
        } catch (e: Exception) {
            Log.w(TAG, "onPause: Failed to disable device receiver", e)
        }
    }

    /**
     * Re-enable device receiver when activity returns to foreground (Issue #5 fix).
     */
    override fun onResume() {
        super.onResume()
        // Only re-enable if we have an active drawing helper
        if (booxDrawingHelper != null && deviceReceiver != null) {
            try {
                deviceReceiver?.enable(this, true)
            } catch (e: Exception) {
                Log.w(TAG, "onResume: Failed to enable device receiver", e)
            }
        }
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
 *
 * APPROACH: Native EPD rendering with bitmap backup
 * - We ENABLE native EPD rendering (setRawDrawingRenderEnabled=true) for ultra-low latency (~10ms)
 * - Strokes are ALSO rendered to our bitmap for export consistency
 * - System gestures handled via GlobalDeviceReceiver (auto-disable when panel opens)
 * - setLimitRect/setExcludeRect confine drawing to canvas area, leaving UI touchable
 *
 * This gives us:
 * 1. Ultra-low latency native EPD preview during drawing
 * 2. Bitmap backup for accurate export
 * 3. System UI access via exclude rects and panel detection
 *
 * Reference implementations: PatKreitzberg/notes-merge, aarontharris/atonyx
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

    // Single reusable Handler to avoid memory leaks (Issue #1 fix)
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val pendingRunnables = mutableListOf<Runnable>()

    init {
        Log.d(TAG, "BooxDrawingHelper: Initializing...")
    }

    /**
     * Open drawing mode with the given bounds and exclude rectangles.
     *
     * @param bounds The drawable area in view-local coordinates
     * @param excludeRects Areas to exclude from drawing (toolbars, status bar)
     */
    fun openDrawing(bounds: Rect, excludeRects: List<Rect> = emptyList()) {
        Log.i(TAG, "openDrawing: bounds=${bounds.left},${bounds.top}-${bounds.right},${bounds.bottom} (${bounds.width()}x${bounds.height()})")
        Log.i(TAG, "openDrawing: excludeRects count=${excludeRects.size}")
        for ((index, rect) in excludeRects.withIndex()) {
            Log.d(TAG, "openDrawing: excludeRect[$index]=${rect.left},${rect.top}-${rect.right},${rect.bottom}")
        }

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
                // NOTE: Stroke width, style, and color should be set AFTER openDrawing()
                // by the caller, since this method just creates the TouchHelper.

                // Set limit rect as a list (required by some SDK versions)
                Log.d(TAG, "openDrawing: Setting limit rect: ${bounds.left},${bounds.top} - ${bounds.right},${bounds.bottom}")
                setLimitRect(mutableListOf(bounds))

                // Set exclude rects separately - this is the correct API pattern
                // Exclude rects allow system UI areas to remain interactive
                if (excludeRects.isNotEmpty()) {
                    Log.d(TAG, "openDrawing: Setting ${excludeRects.size} exclude rects")
                    setExcludeRect(excludeRects)
                }

                openRawDrawing()
                setRawDrawingEnabled(true)

                // ENABLE native EPD rendering for ultra-low latency (~10ms)
                // We also render strokes to bitmap for export, giving us both:
                // - Fast native preview during drawing
                // - Accurate bitmap for export
                // System UI access is handled via exclude rects and GlobalDeviceReceiver
                try {
                    setRawDrawingRenderEnabled(true)
                    Log.i(TAG, "openDrawing: Native EPD rendering ENABLED for ultra-low latency")
                } catch (e: Exception) {
                    Log.w(TAG, "openDrawing: setRawDrawingRenderEnabled not available", e)
                }
            }

            isOpen = true
            Log.i(TAG, "openDrawing: Successfully opened native drawing mode (native EPD + bitmap backup)")

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
     * Force the e-ink display to refresh with current bitmap content.
     *
     * With native EPD rendering enabled, the display updates automatically
     * during drawing. This method is called after stroke completion to ensure
     * the bitmap rendering is also visible (for cases where native and bitmap
     * might differ slightly).
     *
     * The toggle pattern forces a full surface redraw.
     */
    fun forceEpdRefresh() {
        Log.d(TAG, "forceEpdRefresh: Triggering EPD refresh...")
        try {
            // Brief toggle to ensure surface content is refreshed
            // This helps sync native EPD state with our bitmap
            touchHelper?.setRawDrawingEnabled(false)
            touchHelper?.setRawDrawingEnabled(true)
            Log.d(TAG, "forceEpdRefresh: EPD refresh triggered")
        } catch (e: Exception) {
            Log.w(TAG, "forceEpdRefresh: Failed to trigger refresh", e)
        }
    }

    /**
     * Temporarily pause raw drawing to allow UI refresh, then resume.
     * This is needed for updating toolbar/button states which are outside
     * the drawing area.
     *
     * Note: Uses tracked runnables to prevent memory leaks if activity is
     * destroyed while delays are pending (Issue #1 fix).
     */
    fun pauseForUiRefresh(onPaused: () -> Unit) {
        Log.d(TAG, "pauseForUiRefresh: Pausing for UI update...")
        cancelPendingUiRefresh() // Cancel any pending refresh operations

        try {
            touchHelper?.setRawDrawingEnabled(false)

            val resumeRunnable = Runnable {
                touchHelper?.setRawDrawingEnabled(true)
                Log.d(TAG, "pauseForUiRefresh: Drawing resumed")
            }

            val pauseRunnable = Runnable {
                onPaused()
                // Small delay to let the UI update render
                mainHandler.postDelayed(resumeRunnable, 50)
                pendingRunnables.add(resumeRunnable)
            }

            // Give the system a moment to do a normal refresh
            mainHandler.postDelayed(pauseRunnable, 10)
            pendingRunnables.add(pauseRunnable)
        } catch (e: Exception) {
            Log.w(TAG, "pauseForUiRefresh: Failed", e)
            onPaused() // Still call the callback
        }
    }

    /**
     * Cancel any pending UI refresh operations.
     * Called during cleanup to prevent leaks (Issue #1 fix).
     */
    private fun cancelPendingUiRefresh() {
        pendingRunnables.forEach { mainHandler.removeCallbacks(it) }
        pendingRunnables.clear()
    }

    /**
     * Close drawing mode and release resources.
     */
    fun closeDrawing() {
        Log.i(TAG, "closeDrawing: Releasing resources...")

        // Cancel any pending UI refresh runnables to prevent leaks (Issue #1 fix)
        cancelPendingUiRefresh()

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

    // Safe default max pressure - common value for Boox devices
    private const val DEFAULT_MAX_PRESSURE = 4096f

    /**
     * Get max touch pressure from SDK.
     * Always returns a positive value to prevent SDK division-by-zero issues (Issue #7 fix).
     */
    private fun getMaxPressure(): Float {
        if (cachedMaxPressure <= 0f) {
            cachedMaxPressure = try {
                val pressure = com.onyx.android.sdk.api.device.epd.EpdController.getMaxTouchPressure()
                Log.d(TAG, "getMaxPressure: SDK returned $pressure")
                // Validate the SDK value - must be positive to avoid division issues
                if (pressure > 0f) pressure else DEFAULT_MAX_PRESSURE
            } catch (e: Exception) {
                Log.w(TAG, "getMaxPressure: Failed to get from SDK, using default", e)
                DEFAULT_MAX_PRESSURE
            }
        }
        return cachedMaxPressure
    }

    /**
     * Convert our BooxTouchPoint list to SDK TouchPoint list.
     * Note: We pass strokeWidth as the size parameter for each point, matching how notable does it.
     * This ensures the bitmap rendering uses the same stroke width as the native EPD preview.
     */
    private fun toSdkTouchPoints(points: List<BooxTouchPoint>, strokeWidth: Float): List<com.onyx.android.sdk.data.note.TouchPoint> {
        return points.map { pt ->
            com.onyx.android.sdk.data.note.TouchPoint(pt.x, pt.y, pt.pressure, strokeWidth, pt.timestamp)
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

        val sdkPoints = toSdkTouchPoints(stroke.points, stroke.width)

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
        val sdkPoints = toSdkTouchPoints(stroke.points, stroke.width)
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
     * Match notable's implementation: use drawStroke directly
     */
    private fun renderNeoBrushStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points, stroke.width)
        val maxPressure = getMaxPressure()

        try {
            // Use SDK's NeoBrushPen.drawStroke directly (like notable does)
            com.onyx.android.sdk.pen.NeoBrushPen.drawStroke(
                canvas,
                paint,
                sdkPoints,
                stroke.width,
                maxPressure,
                false // not erasing
            )
        } catch (e: Exception) {
            Log.w(TAG, "renderNeoBrushStroke: SDK failed, using fallback", e)
            renderFallbackStroke(canvas, stroke)
        }
    }

    /**
     * Marker: Semi-transparent highlighter strokes.
     * Match notable's simple path-based approach for markers.
     */
    private fun renderMarkerStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color).apply {
            strokeWidth = stroke.width
            alpha = 100 // Semi-transparent like notable
        }

        val points = stroke.points
        if (points.isEmpty()) return

        if (points.size == 1) {
            paint.style = Paint.Style.FILL
            canvas.drawCircle(points[0].x, points[0].y, stroke.width / 2, paint)
            return
        }

        // Simple path-based marker (like notable's drawMarkerStroke)
        val path = Path()
        path.moveTo(points[0].x, points[0].y)

        for (i in 1 until points.size) {
            val prev = points[i - 1]
            val curr = points[i]
            path.quadTo(prev.x, prev.y, curr.x, curr.y)
        }

        canvas.drawPath(path, paint)
    }

    /**
     * Charcoal: Use SDK NeoCharcoalPen for textured charcoal strokes.
     * This matches how notable app renders charcoal/pencil strokes.
     */
    private fun renderCharcoalStroke(canvas: Canvas, stroke: StrokeData) {
        val paint = createPaint(stroke.color)
        val sdkPoints = toSdkTouchPoints(stroke.points, stroke.width)

        Log.d(TAG, "renderCharcoalStroke: Rendering ${sdkPoints.size} points with width=${stroke.width}")

        try {
            // Use SDK's NeoCharcoalPen (not V2) - this is what notable uses
            com.onyx.android.sdk.pen.NeoCharcoalPen.drawNormalStroke(
                null,                                          // RenderContext (nullable)
                canvas,
                paint,
                sdkPoints,
                stroke.color,                                  // color as int
                stroke.width,
                com.onyx.android.sdk.data.note.ShapeCreateArgs(),
                android.graphics.Matrix(),                     // identity matrix
                false                                          // not erasing
            )
            Log.d(TAG, "renderCharcoalStroke: SDK NeoCharcoalPen rendering succeeded")
        } catch (e: Exception) {
            Log.w(TAG, "renderCharcoalStroke: SDK failed (${e.message}), using charcoal fallback", e)
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
