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
    private var hasDrawn = false

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

                val rect = Rect()
                binding.surfaceView.getLocalVisibleRect(rect)
                Log.d(TAG, "surfaceCreated: Canvas size = ${rect.width()}x${rect.height()}")

                // Initialize bitmap for drawing
                initBitmap(rect.width(), rect.height())

                // Clear canvas to white
                clearCanvas()

                // Try to initialize Boox SDK
                if (BooxDeviceUtils.hasFullBooxDrawingSupport) {
                    Log.i(TAG, "surfaceCreated: Initializing Boox TouchHelper...")
                    try {
                        booxDrawingHelper = BooxDrawingHelper(
                            surfaceView = binding.surfaceView,
                            onStrokeComplete = { points -> onNativeStrokeComplete(points) }
                        )
                        booxDrawingHelper?.apply {
                            setStrokeWidth(currentWidth)
                            setStrokeStyle(currentStyle)
                            openDrawing(rect)
                        }
                        Log.i(TAG, "surfaceCreated: Boox TouchHelper initialized successfully!")
                    } catch (e: Exception) {
                        Log.e(TAG, "surfaceCreated: Failed to initialize Boox SDK", e)
                        // Fall back to standard touch handling
                        setupFallbackTouchHandler()
                    }
                } else {
                    Log.i(TAG, "surfaceCreated: No Boox SDK, using fallback touch handling")
                    setupFallbackTouchHandler()
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
            // Multiple points - draw connected lines
            val path = android.graphics.Path()
            val firstPt = points[0]
            path.moveTo(firstPt.x, firstPt.y)

            for (i in 1 until points.size) {
                val pt = points[i]
                path.lineTo(pt.x, pt.y)
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
            // Use tonal style for selected, outlined for unselected
            if (style == currentStyle) {
                // Use a light gray background for selected state
                button.setBackgroundColor(Color.parseColor("#E8E8E8"))
            } else {
                button.setBackgroundColor(Color.TRANSPARENT)
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
 * This is isolated to avoid ClassNotFoundException on non-Boox devices.
 * The actual SDK classes are only referenced inside this class, which is
 * only instantiated after capability detection confirms SDK availability.
 */
class BooxDrawingHelper(
    private val surfaceView: android.view.SurfaceView,
    private val onStrokeComplete: (List<BooxTouchPoint>) -> Unit
) {
    companion object {
        private const val TAG = "BooxDrawingHelper"
    }

    // These are lazily loaded to avoid ClassNotFoundException
    private var touchHelper: Any? = null
    private var isOpen = false

    init {
        Log.d(TAG, "BooxDrawingHelper: Initializing...")
    }

    /**
     * Open drawing mode with the given bounds.
     */
    fun openDrawing(bounds: Rect) {
        Log.i(TAG, "openDrawing: bounds=${bounds.width()}x${bounds.height()}")

        try {
            // Use reflection to load and instantiate TouchHelper
            val touchHelperClass = Class.forName("com.onyx.android.sdk.pen.TouchHelper")

            // Get the create method: TouchHelper.create(SurfaceView, RawInputCallback)
            val rawInputCallbackClass = Class.forName("com.onyx.android.sdk.pen.RawInputCallback")

            // Create our callback proxy
            val callbackProxy = createRawInputCallbackProxy(rawInputCallbackClass)

            // Call TouchHelper.create(surfaceView, callback)
            val createMethod = touchHelperClass.getMethod("create", android.view.SurfaceView::class.java, rawInputCallbackClass)
            touchHelper = createMethod.invoke(null, surfaceView, callbackProxy)

            Log.d(TAG, "openDrawing: TouchHelper created: $touchHelper")

            // Set stroke width
            val setStrokeWidthMethod = touchHelperClass.getMethod("setStrokeWidth", Float::class.java)
            setStrokeWidthMethod.invoke(touchHelper, 3.0f)

            // Set limit rect
            val setLimitRectMethod = touchHelperClass.getMethod("setLimitRect", Rect::class.java, java.util.List::class.java)
            setLimitRectMethod.invoke(touchHelper, bounds, emptyList<Rect>())

            // Open raw drawing
            val openRawDrawingMethod = touchHelperClass.getMethod("openRawDrawing")
            openRawDrawingMethod.invoke(touchHelper)

            // Enable raw drawing
            val setRawDrawingEnabledMethod = touchHelperClass.getMethod("setRawDrawingEnabled", Boolean::class.java)
            setRawDrawingEnabledMethod.invoke(touchHelper, true)

            isOpen = true
            Log.i(TAG, "openDrawing: Successfully opened native drawing mode!")

        } catch (e: Exception) {
            Log.e(TAG, "openDrawing: Failed to initialize TouchHelper", e)
            throw e
        }
    }

    /**
     * Create a proxy implementation of RawInputCallback using reflection.
     */
    private fun createRawInputCallbackProxy(callbackClass: Class<*>): Any {
        Log.d(TAG, "createRawInputCallbackProxy: Creating callback proxy...")

        // Use java.lang.reflect.Proxy to create implementation
        return java.lang.reflect.Proxy.newProxyInstance(
            callbackClass.classLoader,
            arrayOf(callbackClass)
        ) { _, method, args ->
            val methodName = method.name

            when (methodName) {
                "onBeginRawDrawing" -> {
                    Log.v(TAG, "RawInputCallback: onBeginRawDrawing")
                }
                "onRawDrawingTouchPointMoveReceived" -> {
                    // Real-time point during stroke
                    Log.v(TAG, "RawInputCallback: onRawDrawingTouchPointMoveReceived")
                }
                "onRawDrawingTouchPointListReceived" -> {
                    // Complete list of points for stroke
                    Log.d(TAG, "RawInputCallback: onRawDrawingTouchPointListReceived")

                    if (args != null && args.isNotEmpty()) {
                        val touchPointList = args[0]
                        val points = extractTouchPoints(touchPointList)
                        onStrokeComplete(points)
                    }
                }
                "onEndRawDrawing" -> {
                    Log.v(TAG, "RawInputCallback: onEndRawDrawing")
                }
                "onBeginRawErasing" -> {
                    Log.v(TAG, "RawInputCallback: onBeginRawErasing")
                }
                "onRawErasingTouchPointMoveReceived" -> {
                    Log.v(TAG, "RawInputCallback: onRawErasingTouchPointMoveReceived")
                }
                "onRawErasingTouchPointListReceived" -> {
                    Log.d(TAG, "RawInputCallback: onRawErasingTouchPointListReceived")
                }
                "onEndRawErasing" -> {
                    Log.v(TAG, "RawInputCallback: onEndRawErasing")
                }
                else -> {
                    Log.v(TAG, "RawInputCallback: Unknown method: $methodName")
                }
            }
            null
        }
    }

    /**
     * Extract touch points from SDK TouchPointList using reflection.
     */
    private fun extractTouchPoints(touchPointList: Any): List<BooxTouchPoint> {
        Log.v(TAG, "extractTouchPoints: Extracting points from $touchPointList")

        val points = mutableListOf<BooxTouchPoint>()

        try {
            // Get the points list from TouchPointList
            val getPointsMethod = touchPointList.javaClass.getMethod("getPoints")
            @Suppress("UNCHECKED_CAST")
            val rawPoints = getPointsMethod.invoke(touchPointList) as? List<Any> ?: return points

            Log.d(TAG, "extractTouchPoints: Found ${rawPoints.size} points")

            for (rawPoint in rawPoints) {
                // Extract fields from TouchPoint using reflection
                val pointClass = rawPoint.javaClass

                val x = pointClass.getField("x").get(rawPoint) as Float
                val y = pointClass.getField("y").get(rawPoint) as Float
                val pressure = pointClass.getField("pressure").get(rawPoint) as Float
                val size = pointClass.getField("size").get(rawPoint) as Float
                val timestamp = pointClass.getField("timestamp").get(rawPoint) as Long

                points.add(BooxTouchPoint(x, y, pressure, size, timestamp))
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

        try {
            val helper = touchHelper ?: return
            val method = helper.javaClass.getMethod("setStrokeWidth", Float::class.java)
            method.invoke(helper, width)
        } catch (e: Exception) {
            Log.e(TAG, "setStrokeWidth: Failed", e)
        }
    }

    /**
     * Set stroke style.
     */
    fun setStrokeStyle(style: Int) {
        Log.d(TAG, "setStrokeStyle: $style")

        try {
            val helper = touchHelper ?: return
            val method = helper.javaClass.getMethod("setStrokeStyle", Int::class.java)
            method.invoke(helper, style)
        } catch (e: Exception) {
            Log.e(TAG, "setStrokeStyle: Failed", e)
        }
    }

    /**
     * Enable or disable drawing.
     */
    fun setDrawingEnabled(enabled: Boolean) {
        Log.d(TAG, "setDrawingEnabled: $enabled")

        try {
            val helper = touchHelper ?: return
            val method = helper.javaClass.getMethod("setRawDrawingEnabled", Boolean::class.java)
            method.invoke(helper, enabled)
        } catch (e: Exception) {
            Log.e(TAG, "setDrawingEnabled: Failed", e)
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
            val helper = touchHelper ?: return
            val method = helper.javaClass.getMethod("closeRawDrawing")
            method.invoke(helper)
            isOpen = false
            Log.i(TAG, "closeDrawing: Successfully closed")
        } catch (e: Exception) {
            Log.e(TAG, "closeDrawing: Failed", e)
        }

        touchHelper = null
    }
}
