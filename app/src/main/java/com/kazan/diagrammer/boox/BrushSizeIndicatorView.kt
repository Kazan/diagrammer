package com.kazan.diagrammer.boox

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.View

/**
 * A custom view that draws a tapered triangle to indicate brush size range.
 * The triangle is wider at the top (larger brush) and thinner at the bottom (smaller brush).
 * Designed to be placed behind a vertical slider.
 */
class BrushSizeIndicatorView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#333333") // Dark gray for e-ink visibility
        style = Paint.Style.FILL
    }

    private val path = Path()

    // The ratio of min width to max width (how tapered the triangle is)
    private var minWidthRatio = 0.1f
    private var maxWidthRatio = 0.8f

    // Padding from edges
    private var verticalPadding = 16f

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val w = width.toFloat()
        val h = height.toFloat()

        // Calculate the triangle points
        // Top is wider (larger brush), bottom is thinner (smaller brush)
        val topWidth = w * maxWidthRatio
        val bottomWidth = w * minWidthRatio

        val centerX = w / 2f
        val topY = verticalPadding
        val bottomY = h - verticalPadding

        path.reset()
        // Start from bottom-left, go clockwise
        path.moveTo(centerX - bottomWidth / 2f, bottomY)
        path.lineTo(centerX - topWidth / 2f, topY)
        path.lineTo(centerX + topWidth / 2f, topY)
        path.lineTo(centerX + bottomWidth / 2f, bottomY)
        path.close()

        canvas.drawPath(path, paint)
    }

    /**
     * Set the taper ratio for the indicator.
     * @param minRatio The width ratio at the thin end (0.0 to 1.0)
     * @param maxRatio The width ratio at the wide end (0.0 to 1.0)
     */
    fun setTaperRatio(minRatio: Float, maxRatio: Float) {
        minWidthRatio = minRatio.coerceIn(0f, 1f)
        maxWidthRatio = maxRatio.coerceIn(0f, 1f)
        invalidate()
    }

    /**
     * Set the indicator color.
     */
    fun setIndicatorColor(color: Int) {
        paint.color = color
        invalidate()
    }

    /**
     * Set vertical padding for the triangle.
     */
    fun setVerticalPadding(padding: Float) {
        verticalPadding = padding
        invalidate()
    }
}
