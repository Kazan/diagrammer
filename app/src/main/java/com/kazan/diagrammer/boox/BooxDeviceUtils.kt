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
     */
    private fun detectPenSdk(): Boolean {
        Log.d(TAG, "detectPenSdk: checking for TouchHelper class...")

        return try {
            // Try to load the TouchHelper class which is the main entry point
            Class.forName("com.onyx.android.sdk.pen.TouchHelper")
            Log.d(TAG, "detectPenSdk: TouchHelper class found!")

            // Also verify RawInputCallback is available
            Class.forName("com.onyx.android.sdk.pen.RawInputCallback")
            Log.d(TAG, "detectPenSdk: RawInputCallback class found!")

            // Try to detect touch point data class
            Class.forName("com.onyx.android.sdk.pen.data.TouchPoint")
            Log.d(TAG, "detectPenSdk: TouchPoint class found!")

            true
        } catch (e: ClassNotFoundException) {
            Log.d(TAG, "detectPenSdk: SDK class not found: ${e.message}")
            false
        } catch (e: Exception) {
            Log.w(TAG, "detectPenSdk: Unexpected error during detection", e)
            false
        }
    }

    /**
     * Detects if the EPD Controller is available for direct e-ink display access.
     */
    private fun detectEpdController(): Boolean {
        Log.d(TAG, "detectEpdController: checking for EpdController class...")

        return try {
            // Try to load the EpdController class
            Class.forName("com.onyx.android.sdk.device.EpdController")
            Log.d(TAG, "detectEpdController: EpdController class found!")

            // Also check for Device class
            Class.forName("com.onyx.android.sdk.device.Device")
            Log.d(TAG, "detectEpdController: Device class found!")

            true
        } catch (e: ClassNotFoundException) {
            Log.d(TAG, "detectEpdController: EPD class not found: ${e.message}")
            false
        } catch (e: Exception) {
            Log.w(TAG, "detectEpdController: Unexpected error during detection", e)
            false
        }
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
