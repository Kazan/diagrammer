package com.kazan.diagrammer.boox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log

/**
 * BroadcastReceiver for BOOX system events.
 *
 * This receiver listens for:
 * - System notification panel open/close events
 * - Screen on events
 *
 * Used to auto-disable raw drawing when the system notification panel opens,
 * allowing the user to interact with system UI. Drawing is re-enabled when
 * the panel closes.
 *
 * Based on: com.onyx.android.sdk.utils.DeviceReceiver
 * Reference: PatKreitzberg/notes-merge GlobalDeviceReceiver.java
 */
class GlobalDeviceReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "GlobalDeviceReceiver"

        // BOOX SDK system UI dialog actions
        // These are broadcast by the BOOX system when notification panel opens/closes
        const val SYSTEM_UI_DIALOG_OPEN_ACTION = "action_system_ui_dialog_show"
        const val SYSTEM_UI_DIALOG_CLOSE_ACTION = "action_system_ui_dialog_dismiss"
        const val DIALOG_TYPE = "dialog_type"
        const val DIALOG_TYPE_NOTIFICATION_PANEL = "notification_panel"
    }

    private var notificationPanelChangeListener: ((Boolean) -> Unit)? = null
    private var screenOnListener: (() -> Unit)? = null

    /**
     * Set listener for notification panel open/close events.
     * @param listener Called with `true` when panel opens, `false` when it closes
     */
    fun setSystemNotificationPanelChangeListener(listener: (Boolean) -> Unit): GlobalDeviceReceiver {
        this.notificationPanelChangeListener = listener
        return this
    }

    /**
     * Set listener for screen on events.
     */
    fun setSystemScreenOnListener(listener: () -> Unit): GlobalDeviceReceiver {
        this.screenOnListener = listener
        return this
    }

    /**
     * Enable or disable this receiver.
     * @param context Application context
     * @param enable True to register, false to unregister
     */
    fun enable(context: Context, enable: Boolean) {
        try {
            if (enable) {
                val filter = IntentFilter().apply {
                    addAction(SYSTEM_UI_DIALOG_OPEN_ACTION)
                    addAction(SYSTEM_UI_DIALOG_CLOSE_ACTION)
                    addAction(Intent.ACTION_SCREEN_ON)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(this, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    context.registerReceiver(this, filter)
                }
                Log.d(TAG, "enable: Receiver registered")
            } else {
                try {
                    context.unregisterReceiver(this)
                    Log.d(TAG, "enable: Receiver unregistered")
                } catch (e: IllegalArgumentException) {
                    // Receiver was not registered, ignore
                    Log.d(TAG, "enable: Receiver was not registered")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "enable: Failed to ${if (enable) "register" else "unregister"} receiver", e)
        }
    }

    override fun onReceive(context: Context?, intent: Intent?) {
        val action = intent?.action ?: return

        Log.d(TAG, "onReceive: action=$action")

        when (action) {
            SYSTEM_UI_DIALOG_OPEN_ACTION -> {
                val dialogType = intent.getStringExtra(DIALOG_TYPE)
                Log.d(TAG, "onReceive: Dialog open, type=$dialogType")
                if (dialogType == DIALOG_TYPE_NOTIFICATION_PANEL) {
                    notificationPanelChangeListener?.invoke(true)
                }
            }
            SYSTEM_UI_DIALOG_CLOSE_ACTION -> {
                val dialogType = intent.getStringExtra(DIALOG_TYPE)
                Log.d(TAG, "onReceive: Dialog close, type=$dialogType")
                if (dialogType == DIALOG_TYPE_NOTIFICATION_PANEL) {
                    notificationPanelChangeListener?.invoke(false)
                }
            }
            Intent.ACTION_SCREEN_ON -> {
                Log.d(TAG, "onReceive: Screen on")
                screenOnListener?.invoke()
            }
        }
    }
}
