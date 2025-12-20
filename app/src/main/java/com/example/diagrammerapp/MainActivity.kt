package com.example.diagrammerapp

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.example.diagrammerapp.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var assetLoader: WebViewAssetLoader
    private val ioScope = CoroutineScope(Dispatchers.IO + Job())
    private val mainHandler = Handler(Looper.getMainLooper())

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private val galleryLauncher = registerForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        val callback = fileChooserCallback
        if (callback == null) return@registerForActivityResult
        if (uris.isNullOrEmpty()) {
            callback.onReceiveValue(null)
        } else {
            uris.forEach {
                try {
                    contentResolver.takePersistableUriPermission(
                        it,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (_: SecurityException) {
                    // Ignore if persistable not granted.
                }
            }
            callback.onReceiveValue(uris.toTypedArray())
        }
        fileChooserCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        enterImmersive()

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        with(binding.webView) {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.setSupportZoom(false)
            settings.mediaPlaybackRequiresUserGesture = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                settings.safeBrowsingEnabled = true
            }
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            setOnLongClickListener { true }
            webViewClient = DiagrammerWebViewClient()
            webChromeClient = DiagrammerWebChromeClient()
            addJavascriptInterface(
                NativeBridge(
                    context = this@MainActivity,
                    ioScope = ioScope,
                    mainHandler = mainHandler,
                    webView = this
                ),
                "NativeBridge"
            )
        }

        binding.webView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (binding.webView.canGoBack()) {
                        binding.webView.goBack()
                    } else {
                        finish()
                    }
                }
            }
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    override fun onDestroy() {
        super.onDestroy()
        binding.webView.destroy()
    }

    private fun enterImmersive() {
        val controller = WindowInsetsControllerCompat(window, binding.webView)
        controller.hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private inner class DiagrammerWebViewClient : WebViewClient() {
        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            return assetLoader.shouldInterceptRequest(request.url)
        }

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest
        ): Boolean {
            val url = request.url
            val isAsset = url.host == "appassets.androidplatform.net"
            return !isAsset
        }

        override fun onRenderProcessGone(
            view: WebView,
            detail: android.webkit.RenderProcessGoneDetail
        ): Boolean {
            binding.webView.removeAllViews()
            binding.webView.destroy()
            binding.webView.visibility = View.GONE
            recreate()
            return true
        }
    }

    private inner class DiagrammerWebChromeClient : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback
            galleryLauncher.launch(arrayOf("image/*"))
            return true
        }
    }
}

private class NativeBridge(
    private val context: Context,
    private val ioScope: CoroutineScope,
    private val mainHandler: Handler,
    private val webView: WebView
) {
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)

    @JavascriptInterface
    fun saveScene(json: String) {
        ioScope.launch {
            val file = File(context.filesDir, "autosave.excalidraw.json")
            runCatching { file.writeText(json) }
                .onSuccess { notifyJs("onSaveComplete", true, null) }
                .onFailure { notifyJs("onSaveComplete", false, it.message) }
        }
    }

    @JavascriptInterface
    fun loadScene(): String? {
        val file = File(context.filesDir, "autosave.excalidraw.json")
        return runCatching { file.takeIf { it.exists() }?.readText() }.getOrNull()
    }

    @JavascriptInterface
    fun exportPng(base64DataUrl: String) {
        ioScope.launch {
            val bytes = decodeBase64DataUrl(base64DataUrl) ?: run {
                notifyJs("onExportComplete", false, "Invalid PNG data")
                return@launch
            }
            val displayName = "diagram_${dateFormat.format(Date())}.png"
            saveToMediaStore(bytes, "image/png", displayName)
        }
    }

    @JavascriptInterface
    fun exportSvg(base64DataUrl: String) {
        ioScope.launch {
            val bytes = decodeBase64DataUrl(base64DataUrl) ?: run {
                notifyJs("onExportComplete", false, "Invalid SVG data")
                return@launch
            }
            val displayName = "diagram_${dateFormat.format(Date())}.svg"
            saveToMediaStore(bytes, "image/svg+xml", displayName)
        }
    }

    private fun saveToMediaStore(bytes: ByteArray, mimeType: String, displayName: String) {
        val resolver = context.contentResolver
        val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val contentValues = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/Diagrammer")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
        }

        val uri = resolver.insert(collection, contentValues)
        if (uri == null) {
            notifyJs("onExportComplete", false, "Unable to create media entry")
            return
        }

        try {
            resolver.openOutputStream(uri)?.use { stream ->
                stream.write(bytes)
                stream.flush()
            } ?: run {
                notifyJs("onExportComplete", false, "No output stream")
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val pendingClear = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                resolver.update(uri, pendingClear, null, null)
            }
            notifyJs("onExportComplete", true, null)
        } catch (ioe: IOException) {
            notifyJs("onExportComplete", false, ioe.message)
        }
    }

    private fun decodeBase64DataUrl(dataUrl: String): ByteArray? {
        val cleaned = dataUrl.substringAfter(',')
        return runCatching { Base64.decode(cleaned, Base64.DEFAULT) }.getOrNull()
    }

    private fun notifyJs(event: String, success: Boolean, message: String?) {
        val payload = JSONObject()
        payload.put("event", event)
        payload.put("success", success)
        message?.let { payload.put("message", it) }
        val script = "window.NativeBridgeCallbacks && window.NativeBridgeCallbacks.onNativeMessage(${payload});"
        mainHandler.post {
            webView.evaluateJavascript(script, null)
        }
    }
}
