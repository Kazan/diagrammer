package com.kazan.diagrammer.boox

import android.os.Build
import android.util.Log

/**
 * Utility object for detecting Boox/Onyx device capabilities.
 *
 * Boox devices provide native stylus drawing via their SDK which offers:
 * - Direct EPD (e-ink display) access for near-zero latency rendering
 * - Pressure-sensitive stylus input from the Wacom digitizer layer
 * - Hardware-optimized A2/DU waveform modes for smooth strokes
 *
 * This class performs runtime detection to determine if the full native
 * drawing experience is available.
 */
object BooxDeviceUtils {

    private const val TAG = "BooxDeviceUtils"

    /**
     * Cached result of capability detection.
     * Lazy-initialized on first access.
     */
    val hasFullBooxDrawingSupport: Boolean by lazy { detectCapabilities() }

    /**
     * Whether the device is manufactured by Onyx/Boox.
     */
    val isOnyxDevice: Boolean by lazy { detectOnyxDevice() }

    /**
     * Whether the Pen SDK classes are available at runtime.
     */
    val hasPenSdk: Boolean by lazy { detectPenSdk() }

    /**
     * Whether the EPD Controller is available for direct e-ink access.
     */
    val hasEpdController: Boolean by lazy { detectEpdController() }

    /**
     * Device model name for logging purposes.
     */
    val deviceModel: String
        get() = "${Build.MANUFACTURER} ${Build.MODEL}"

    /**
     * Android API level for logging purposes.
     */
    val androidApiLevel: Int
        get() = Build.VERSION.SDK_INT

    /**
     * Performs full capability detection with extensive logging.
     */
    private fun detectCapabilities(): Boolean {
        Log.i(TAG, "=== Boox Capability Detection Started ===")
        Log.i(TAG, "Device: $deviceModel")
        Log.i(TAG, "Android API: $androidApiLevel (${Build.VERSION.RELEASE})")
        Log.i(TAG, "Build: ${Build.DISPLAY}")

        val isOnyx = isOnyxDevice
        val hasPen = hasPenSdk
        val hasEpd = hasEpdController

        Log.i(TAG, "Detection Results:")
        Log.i(TAG, "  - Is Onyx Device: $isOnyx")
        Log.i(TAG, "  - Pen SDK Available: $hasPen")
        Log.i(TAG, "  - EPD Controller Available: $hasEpd")

        val hasFullSupport = isOnyx && hasPen && hasEpd

        Log.i(TAG, "hasFullBooxDrawingSupport: isOnyx=$isOnyx, hasPenSdk=$hasPen, hasEpd=$hasEpd")
        Log.i(TAG, "=== Final Result: hasFullBooxDrawingSupport = $hasFullSupport ===")

        return hasFullSupport
    }

    /**
     * Detects if running on an Onyx/Boox device by checking manufacturer.
     */
    private fun detectOnyxDevice(): Boolean {
        val manufacturer = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()
        val model = Build.MODEL.lowercase()

        Log.d(TAG, "detectOnyxDevice: manufacturer='$manufacturer', brand='$brand', model='$model'")

        // Check for various Onyx/Boox identifiers
        val isOnyx = manufacturer.contains("onyx") ||
            brand.contains("onyx") ||
            brand.contains("boox") ||
            model.contains("boox") ||
            // Some devices report as "Qualcomm" but have Boox in model
            model.contains("nova") && manufacturer.contains("qualcomm") ||
            model.contains("note") && manufacturer.contains("qualcomm") ||
            model.contains("tab ultra") ||
            model.contains("air4") ||
            model.contains("air 4")

        Log.d(TAG, "detectOnyxDevice: result=$isOnyx")
        return isOnyx
    }

    /**
     * Detects if the Pen SDK is available by attempting to load key classes.
     * Tries multiple known package paths as Boox has moved classes between SDK versions.
     */
    private fun detectPenSdk(): Boolean {
        Log.d(TAG, "detectPenSdk: checking for TouchHelper class...")

        // List of known package paths for TouchHelper across different SDK versions
        val touchHelperClasses = listOf(
            "com.onyx.android.sdk.pen.TouchHelper",
            "com.onyx.android.sdk.api.device.pen.TouchHelper",
            "com.onyx.android.sdk.scribble.touch.TouchHelper"
        )

        val rawInputCallbackClasses = listOf(
            "com.onyx.android.sdk.pen.RawInputCallback",
            "com.onyx.android.sdk.api.device.pen.RawInputCallback",
            "com.onyx.android.sdk.scribble.touch.RawInputCallback"
        )

        val touchPointClasses = listOf(
            "com.onyx.android.sdk.pen.data.TouchPoint",
            "com.onyx.android.sdk.data.note.TouchPoint",
            "com.onyx.android.sdk.api.device.pen.data.TouchPoint"
        )

        var foundTouchHelper = false
        var foundRawInputCallback = false
        var foundTouchPoint = false

        // Try to find TouchHelper
        for (className in touchHelperClasses) {
            try {
                Class.forName(className)
                Log.d(TAG, "detectPenSdk: TouchHelper found at $className")
                foundTouchHelper = true
                break
            } catch (e: ClassNotFoundException) {
                Log.d(TAG, "detectPenSdk: TouchHelper not at $className")
            }
        }

        // Try to find RawInputCallback
        for (className in rawInputCallbackClasses) {
            try {
                Class.forName(className)
                Log.d(TAG, "detectPenSdk: RawInputCallback found at $className")
                foundRawInputCallback = true
                break
            } catch (e: ClassNotFoundException) {
                Log.d(TAG, "detectPenSdk: RawInputCallback not at $className")
            }
        }

        // Try to find TouchPoint
        for (className in touchPointClasses) {
            try {
                Class.forName(className)
                Log.d(TAG, "detectPenSdk: TouchPoint found at $className")
                foundTouchPoint = true
                break
            } catch (e: ClassNotFoundException) {
                Log.d(TAG, "detectPenSdk: TouchPoint not at $className")
            }
        }

        val result = foundTouchHelper && foundRawInputCallback && foundTouchPoint
        Log.d(TAG, "detectPenSdk: result=$result (TouchHelper=$foundTouchHelper, RawInputCallback=$foundRawInputCallback, TouchPoint=$foundTouchPoint)")
        return result
    }

    /**
     * Detects if the EPD Controller is available for direct e-ink display access.
     * Tries multiple known package paths as Boox has moved classes between SDK versions.
     */
    private fun detectEpdController(): Boolean {
        Log.d(TAG, "detectEpdController: checking for EpdController class...")

        // List of known package paths for EpdController across different SDK versions
        val epdControllerClasses = listOf(
            "com.onyx.android.sdk.api.device.epd.EpdController",
            "com.onyx.android.sdk.device.EpdController",
            "com.onyx.android.sdk.device.epd.EpdController"
        )

        val deviceClasses = listOf(
            "com.onyx.android.sdk.api.device.Device",
            "com.onyx.android.sdk.device.Device"
        )

        var foundEpdController = false
        var foundDevice = false

        // Try to find EpdController
        for (className in epdControllerClasses) {
            try {
                Class.forName(className)
                Log.d(TAG, "detectEpdController: EpdController found at $className")
                foundEpdController = true
                break
            } catch (e: ClassNotFoundException) {
                Log.d(TAG, "detectEpdController: EpdController not at $className")
            }
        }

        // Try to find Device class (optional, less critical)
        for (className in deviceClasses) {
            try {
                Class.forName(className)
                Log.d(TAG, "detectEpdController: Device found at $className")
                foundDevice = true
                break
            } catch (e: ClassNotFoundException) {
                Log.d(TAG, "detectEpdController: Device not at $className")
            }
        }

        // EpdController is the critical one, Device is nice to have
        val result = foundEpdController
        Log.d(TAG, "detectEpdController: result=$result (EpdController=$foundEpdController, Device=$foundDevice)")
        return result
    }

    /**
     * Logs a summary of all device capabilities.
     * Call this on app startup for diagnostics.
     */
    fun logCapabilitySummary() {
        Log.i(TAG, "╔══════════════════════════════════════════╗")
        Log.i(TAG, "║     BOOX DEVICE CAPABILITY SUMMARY       ║")
        Log.i(TAG, "╠══════════════════════════════════════════╣")
        Log.i(TAG, "║ Device: $deviceModel")
        Log.i(TAG, "║ Android: ${Build.VERSION.RELEASE} (API $androidApiLevel)")
        Log.i(TAG, "╠══════════════════════════════════════════╣")
        Log.i(TAG, "║ Is Onyx Device:     ${if (isOnyxDevice) "✓ YES" else "✗ NO"}")
        Log.i(TAG, "║ Pen SDK Available:  ${if (hasPenSdk) "✓ YES" else "✗ NO"}")
        Log.i(TAG, "║ EPD Controller:     ${if (hasEpdController) "✓ YES" else "✗ NO"}")
        Log.i(TAG, "╠══════════════════════════════════════════╣")
        Log.i(TAG, "║ NATIVE DRAWING:     ${if (hasFullBooxDrawingSupport) "✓ ENABLED" else "✗ DISABLED"}")
        Log.i(TAG, "╚══════════════════════════════════════════╝")
    }
}
