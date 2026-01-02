package com.kazan.diagrammer

import android.app.Application
import android.os.Build
import android.util.Log
import dagger.hilt.android.HiltAndroidApp
import org.lsposed.hiddenapibypass.HiddenApiBypass

@HiltAndroidApp
class DiagrammerApp : Application() {
    
    companion object {
        private const val TAG = "DiagrammerApp"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Enable hidden API bypass for Android 11+ (required for Boox SDK)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Log.d(TAG, "Enabling HiddenApiBypass for Android ${Build.VERSION.SDK_INT}")
            try {
                HiddenApiBypass.addHiddenApiExemptions("")
                Log.d(TAG, "HiddenApiBypass enabled successfully")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to enable HiddenApiBypass", e)
            }
        }
    }
}
