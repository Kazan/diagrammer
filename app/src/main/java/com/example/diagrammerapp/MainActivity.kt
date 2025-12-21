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
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
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
    private var nativeBridge: NativeBridge? = null
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    private val ioScope = CoroutineScope(Dispatchers.IO + Job())
    private val mainHandler = Handler(Looper.getMainLooper())

    private var pendingDocumentContent: String? = null
    private val createDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/vnd.excalidraw+json")
    ) { uri ->
        nativeBridge?.completeDocumentSave(uri, pendingDocumentContent)
        pendingDocumentContent = null
    }

    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        nativeBridge?.completeDocumentLoad(uri)
    }

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
                    webView = this,
                    startDocumentPicker = { content ->
                        pendingDocumentContent = content
                        val fileName = "diagram_${dateFormat.format(Date())}.excalidraw"
                        createDocumentLauncher.launch(fileName)
                    },
                    startOpenDocument = {
                        openDocumentLauncher.launch(arrayOf("application/json", "application/octet-stream", "*/*"))
                    }
                ).also { nativeBridge = it },
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
    private val webView: WebView,
    private val startDocumentPicker: (String) -> Unit,
    private val startOpenDocument: () -> Unit
) {
    private val prefs = context.getSharedPreferences("diagrammer_prefs", Context.MODE_PRIVATE)
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    @Volatile
    private var pendingDocumentContent: String? = null
    @Volatile
    private var currentDocumentUri: Uri? = null
    @Volatile
    private var currentDocumentName: String? = null

    init {
        val storedUri = prefs.getString("current_uri", null)
        val storedName = prefs.getString("current_name", null)
        currentDocumentUri = storedUri?.let { Uri.parse(it) }
        currentDocumentName = storedName
    }

    private fun getDisplayName(uri: Uri): String? {
        return runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
                }
        }.getOrNull()
    }

    private fun persistCurrentFile(uri: Uri?, name: String?) {
        prefs.edit()
            .putString("current_uri", uri?.toString())
            .putString("current_name", name)
            .apply()
    }

    private fun ensureExcalidrawName(uri: Uri): Pair<Uri, String?> {
        val existingName = getDisplayName(uri) ?: uri.lastPathSegment
        val hasExtension = existingName?.lowercase(Locale.US)?.endsWith(".excalidraw") == true
        if (hasExtension) return uri to existingName
        val base = existingName?.substringBeforeLast('.') ?: existingName ?: "diagram"
        val desiredName = "$base.excalidraw"
        val renamed = runCatching {
            DocumentsContract.renameDocument(context.contentResolver, uri, desiredName)
        }.getOrNull() ?: uri
        return renamed to desiredName
    }

    @JavascriptInterface
    fun saveScene(json: String) {
        ioScope.launch {
            val file = File(context.filesDir, "autosave.excalidraw.json")
            runCatching { file.writeText(json) }
                .onSuccess { notifyJs("onSaveComplete", true, null, null) }
                .onFailure { notifyJs("onSaveComplete", false, it.message, null) }
        }
    }

    @JavascriptInterface
    fun saveSceneToDocument(json: String) {
        pendingDocumentContent = json
        mainHandler.post {
            startDocumentPicker(json)
        }
    }

    @JavascriptInterface
    fun saveSceneToCurrentDocument(json: String) {
        val target = currentDocumentUri
        if (target == null) {
            notifyJs("onSaveComplete", false, "No current file", null)
            return
        }
        ioScope.launch {
            runCatching {
                context.contentResolver.openOutputStream(target)?.use { stream ->
                    stream.write(json.toByteArray())
                    stream.flush()
                } ?: error("No output stream")
            }.onSuccess {
                val (finalUri, finalName) = ensureExcalidrawName(target)
                currentDocumentUri = finalUri
                currentDocumentName = finalName ?: currentDocumentName
                persistCurrentFile(currentDocumentUri, currentDocumentName)
                notifyJs("onSaveComplete", true, null, currentDocumentName)
            }.onFailure {
                notifyJs("onSaveComplete", false, it.message, currentDocumentName)
            }
        }
    }

    @JavascriptInterface
    fun openSceneFromDocument() {
        mainHandler.post {
            startOpenDocument()
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
                notifyJs("onExportComplete", false, "Invalid PNG data", null)
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
                notifyJs("onExportComplete", false, "Invalid SVG data", null)
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
            notifyJs("onExportComplete", false, "Unable to create media entry", null)
            return
        }

        try {
            resolver.openOutputStream(uri)?.use { stream ->
                stream.write(bytes)
                stream.flush()
            } ?: run {
                notifyJs("onExportComplete", false, "No output stream", null)
                return
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val pendingClear = ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
                resolver.update(uri, pendingClear, null, null)
            }
            notifyJs("onExportComplete", true, null, null)
        } catch (ioe: IOException) {
            notifyJs("onExportComplete", false, ioe.message, null)
        }
    }

    private fun decodeBase64DataUrl(dataUrl: String): ByteArray? {
        val cleaned = dataUrl.substringAfter(',')
        return runCatching { Base64.decode(cleaned, Base64.DEFAULT) }.getOrNull()
    }

    private fun notifyJs(event: String, success: Boolean, message: String?, fileName: String?) {
        val payload = JSONObject()
        payload.put("event", event)
        payload.put("success", success)
        message?.let { payload.put("message", it) }
        fileName?.let { payload.put("fileName", it) }
        val script = "window.NativeBridgeCallbacks && window.NativeBridgeCallbacks.onNativeMessage(${payload});"
        mainHandler.post {
            webView.evaluateJavascript(script, null)
        }
    }

    fun completeDocumentSave(uri: Uri?, content: String?) {
        if (uri == null) {
            notifyJs("onSaveComplete", false, "No location selected", null)
            return
        }
        val data = content ?: run {
            notifyJs("onSaveComplete", false, "Nothing to save", null)
            return
        }
        ioScope.launch {
            runCatching {
                context.contentResolver.openOutputStream(uri)?.use { stream ->
                    stream.write(data.toByteArray())
                    stream.flush()
                } ?: error("No output stream")
            }.onSuccess {
                val (finalUri, finalName) = ensureExcalidrawName(uri)
                currentDocumentUri = finalUri
                currentDocumentName = finalName ?: uri.lastPathSegment
                persistCurrentFile(currentDocumentUri, currentDocumentName)
                notifyJs("onSaveComplete", true, null, currentDocumentName)
            }.onFailure {
                notifyJs("onSaveComplete", false, it.message, currentDocumentName)
            }
        }
    }

    fun completeDocumentLoad(uri: Uri?) {
        if (uri == null) {
            notifyJs("onNativeMessage", false, "No file selected", null)
            return
        }
        ioScope.launch {
            val content = runCatching {
                context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
            }.getOrNull()
            if (content == null) {
                notifyJs("onNativeMessage", false, "Unable to read file", null)
                return@launch
            }
            val displayName = getDisplayName(uri)
            val normalizedName = displayName ?: uri.lastPathSegment
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (_: SecurityException) {
                // ignore if not persistable
            }
            currentDocumentUri = uri
            currentDocumentName = normalizedName
            persistCurrentFile(currentDocumentUri, currentDocumentName)
            val escaped = JSONObject.quote(content)
            val name = JSONObject.quote(currentDocumentName ?: "")
            val script = "window.NativeBridgeCallbacks && window.NativeBridgeCallbacks.onSceneLoaded(${escaped}, ${name});"
            mainHandler.post {
                webView.evaluateJavascript(script, null)
            }
        }
    }

    @JavascriptInterface
    fun getCurrentFileName(): String? = currentDocumentName
}
