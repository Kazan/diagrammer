@file:Suppress("DEPRECATION")

package com.example.diagrammerapp

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
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
import android.content.Intent
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.example.diagrammerapp.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Suppress("DEPRECATION")
class MainActivity : ComponentActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var assetLoader: WebViewAssetLoader
    private var nativeBridge: NativeBridge? = null
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    private val ioScope = CoroutineScope(Dispatchers.IO + Job())
    private val mainHandler = Handler(Looper.getMainLooper())

    private val createDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/vnd.excalidraw+json")
    ) { uri ->
        nativeBridge?.completeDocumentSave(uri)
        enterImmersive()
    }

    private val openDocumentLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocument()
    ) { uri ->
        nativeBridge?.completeDocumentLoad(uri)
        enterImmersive()
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
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(true)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        enterImmersive()

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        @Suppress("DEPRECATION")
        with(binding.webView) {
            setBackgroundColor(0xFF000000.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            @Suppress("DEPRECATION")
            settings.allowFileAccess = false
            @Suppress("DEPRECATION")
            settings.allowContentAccess = true
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
                    startDocumentPicker = { envelope ->
                        exitImmersive()
                        val suggested = envelope.suggestedName?.takeIf { it.isNotBlank() }
                            ?: "diagram_${dateFormat.format(Date())}.excalidraw"
                        createDocumentLauncher.launch(suggested)
                    },
                    startOpenDocument = {
                        exitImmersive()
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

    @Suppress("DEPRECATION")
    private fun enterImmersive() {
        val controller = WindowInsetsControllerCompat(window, binding.webView)
        controller.hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }

    private fun exitImmersive() {
        val controller = WindowInsetsControllerCompat(window, binding.webView)
        controller.show(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
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
        override fun onConsoleMessage(message: android.webkit.ConsoleMessage?): Boolean {
            if (message != null) {
                Log.d(
                    "DiagrammerWebView",
                    "${message.messageLevel()}: ${message.message()} @ ${message.sourceId()}:${message.lineNumber()}"
                )
            }
            return super.onConsoleMessage(message)
        }

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

    private data class SaveEnvelope(
        val json: String,
        val byteLength: Long,
        val sha256: String?,
        val suggestedName: String?,
        val createdAt: Long,
    )

private class NativeBridge(
    private val context: Context,
    private val ioScope: CoroutineScope,
    private val mainHandler: Handler,
    private val webView: WebView,
    private val startDocumentPicker: (SaveEnvelope) -> Unit,
    private val startOpenDocument: () -> Unit
) {
    private val prefs = context.getSharedPreferences("diagrammer_prefs", Context.MODE_PRIVATE)
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    @Volatile
    private var pendingEnvelope: SaveEnvelope? = null
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

    private fun parseEnvelope(raw: String?, source: String): SaveEnvelope? {
        if (raw.isNullOrBlank()) {
            Log.w("NativeBridge", "$source: missing envelope payload")
            notifyJs("onSaveComplete", false, "Invalid save payload", currentDocumentName)
            return null
        }
        return runCatching {
            val obj = JSONObject(raw)
            val json = obj.optString("json", "")
            val byteLength = obj.optLong("byteLength", -1)
            val sha256 = obj.optString("sha256", null)?.takeIf { it.isNotBlank() }
            val suggestedName = obj.optString("suggestedName", null)?.takeIf { it.isNotBlank() }
            val createdAt = obj.optLong("createdAt", System.currentTimeMillis())
            SaveEnvelope(json = json, byteLength = byteLength, sha256 = sha256, suggestedName = suggestedName, createdAt = createdAt)
        }.getOrElse {
            Log.e("NativeBridge", "$source: failed to parse envelope", it)
            notifyJs("onSaveComplete", false, "Invalid save payload", currentDocumentName)
            null
        }
    }

    private fun validateEnvelope(envelope: SaveEnvelope, source: String): Boolean {
        val bytes = envelope.json.toByteArray(Charsets.UTF_8)
        if (envelope.byteLength >= 0 && bytes.size.toLong() != envelope.byteLength) {
            Log.e(
                "NativeBridge",
                "$source: byteLength mismatch (expected=${envelope.byteLength}, actual=${bytes.size})"
            )
            notifyJs("onSaveComplete", false, "Corrupt save payload", currentDocumentName)
            return false
        }
        val declaredSha = envelope.sha256
        if (!declaredSha.isNullOrBlank()) {
            val actualSha = computeSha(bytes)
            if (!declaredSha.equals(actualSha, ignoreCase = true)) {
                Log.e(
                    "NativeBridge",
                    "$source: sha mismatch (expected=$declaredSha, actual=$actualSha)"
                )
                notifyJs("onSaveComplete", false, "Corrupt save payload", currentDocumentName)
                return false
            }
        }
        if (!isValidJsonStrict(envelope.json)) {
            Log.e("NativeBridge", "$source: invalid JSON payload")
            notifyJs("onSaveComplete", false, "Invalid scene JSON", currentDocumentName)
            return false
        }
        return true
    }

    private fun isValidJsonStrict(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return false
        return try {
            val first = trimmed.first()
            when (first) {
                '{' -> JSONObject(trimmed)
                '[' -> JSONArray(trimmed)
                else -> return false
            }
            true
        } catch (ex: Exception) {
            false
        }
    }

    private fun computeSha(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return buildString(digest.size * 2) {
            digest.forEach { b ->
                append(((b.toInt() ushr 4) and 0xF).toString(16))
                append((b.toInt() and 0xF).toString(16))
            }
        }
    }

    private fun legacyEnvelope(json: String, suggestedName: String? = null): SaveEnvelope {
        val bytes = json.toByteArray(Charsets.UTF_8)
        val sha = computeSha(bytes)
        return SaveEnvelope(
            json = json,
            byteLength = bytes.size.toLong(),
            sha256 = sha,
            suggestedName = suggestedName,
            createdAt = System.currentTimeMillis()
        )
    }

    private suspend fun writeEnvelopeToFile(file: File, envelope: SaveEnvelope, source: String) {
        Log.d(
            "NativeBridge",
            "$source: writing to file=${file.name}, bytes=${envelope.byteLength}, suggested=${envelope.suggestedName}"
        )
        runCatching { file.writeText(envelope.json) }
            .onSuccess { notifyJs("onSaveComplete", true, null, envelope.suggestedName) }
            .onFailure {
                Log.e("NativeBridge", "$source: write failed", it)
                notifyJs("onSaveComplete", false, it.message, envelope.suggestedName)
            }
    }

    private suspend fun writeEnvelopeToUri(uri: Uri, envelope: SaveEnvelope, source: String) {
        Log.d(
            "NativeBridge",
            "$source: writing to uri=${uri}, bytes=${envelope.byteLength}, suggested=${envelope.suggestedName}"
        )
        runCatching {
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
            } catch (_: SecurityException) {
                // Proceed; openOutputStream will still fail if permission is insufficient.
            }
            val mode = "rwt"
            val stream = runCatching {
                context.contentResolver.openOutputStream(uri, mode)
            }.getOrNull() ?: context.contentResolver.openOutputStream(uri, "w")
            stream?.use {
                it.write(envelope.json.toByteArray(Charsets.UTF_8))
                it.flush()
            } ?: error("No output stream")
        }.onSuccess {
            val (finalUri, finalName) = ensureExcalidrawName(uri)
            currentDocumentUri = finalUri
            currentDocumentName = finalName ?: currentDocumentName
            persistCurrentFile(currentDocumentUri, currentDocumentName)
            notifyJs("onSaveComplete", true, null, currentDocumentName)
        }.onFailure {
            Log.e("NativeBridge", "$source: write failed", it)
            notifyJs("onSaveComplete", false, it.message, currentDocumentName)
        }
    }

    @JavascriptInterface
    fun persistScene(envelopeJson: String) {
        ioScope.launch {
            val envelope = parseEnvelope(envelopeJson, "persistScene") ?: return@launch
            if (!validateEnvelope(envelope, "persistScene")) return@launch
            writeEnvelopeToFile(File(context.filesDir, "autosave.excalidraw.json"), envelope, "persistScene")
        }
    }

    @JavascriptInterface
    fun persistSceneToDocument(envelopeJson: String) {
        pendingEnvelope = null
        val envelope = parseEnvelope(envelopeJson, "persistSceneToDocument") ?: return
        if (!validateEnvelope(envelope, "persistSceneToDocument")) return
        pendingEnvelope = envelope
        Log.d(
            "NativeBridge",
            "persistSceneToDocument: queued bytes=${envelope.byteLength}, suggested=${envelope.suggestedName}"
        )
        mainHandler.post {
            startDocumentPicker(envelope)
        }
    }

    @JavascriptInterface
    fun persistSceneToCurrentDocument(envelopeJson: String) {
        val target = currentDocumentUri
        if (target == null) {
            notifyJs("onSaveComplete", false, "No current file", null)
            return
        }
        ioScope.launch {
            val envelope = parseEnvelope(envelopeJson, "persistSceneToCurrentDocument") ?: return@launch
            if (!validateEnvelope(envelope, "persistSceneToCurrentDocument")) return@launch
            writeEnvelopeToUri(target, envelope, "persistSceneToCurrentDocument")
        }
    }

    // Legacy entry points maintained for backward compatibility.
    @JavascriptInterface
    fun saveScene(json: String) {
        Log.d("NativeBridge", "saveScene (legacy) invoked")
        ioScope.launch {
            val envelope = legacyEnvelope(json, currentDocumentName)
            if (!validateEnvelope(envelope, "saveScene")) return@launch
            writeEnvelopeToFile(File(context.filesDir, "autosave.excalidraw.json"), envelope, "saveScene")
        }
    }

    @JavascriptInterface
    fun saveSceneToDocument(json: String) {
        pendingEnvelope = null
        val envelope = legacyEnvelope(json, currentDocumentName)
        if (!validateEnvelope(envelope, "saveSceneToDocument")) return
        pendingEnvelope = envelope
        Log.d(
            "NativeBridge",
            "saveSceneToDocument (legacy): queued bytes=${envelope.byteLength}, suggested=${envelope.suggestedName}"
        )
        mainHandler.post {
            startDocumentPicker(envelope)
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
            val envelope = legacyEnvelope(json, currentDocumentName)
            if (!validateEnvelope(envelope, "saveSceneToCurrentDocument")) return@launch
            writeEnvelopeToUri(target, envelope, "saveSceneToCurrentDocument")
        }
    }

    @JavascriptInterface
    fun openSceneFromDocument() {
        Log.d("NativeBridge", "openSceneFromDocument invoked")
        mainHandler.post {
            startOpenDocument()
        }
    }

    @JavascriptInterface
    fun loadScene(): String? {
        val file = File(context.filesDir, "autosave.excalidraw.json")
        val result = runCatching { file.takeIf { it.exists() }?.readText() }.getOrNull()
        Log.d("NativeBridge", "loadScene -> bytes=${result?.length ?: 0}")
        return result
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
        Log.d("NativeBridge", "notifyJs -> $payload")
        mainHandler.post {
            webView.evaluateJavascript(script, null)
        }
    }

    fun completeDocumentSave(uri: Uri?) {
        if (uri == null) {
            pendingEnvelope = null
            notifyJs("onSaveComplete", false, "No location selected", null)
            return
        }
        val envelope = pendingEnvelope ?: run {
            notifyJs("onSaveComplete", false, "Nothing to save", null)
            return
        }
        pendingEnvelope = null
        if (!validateEnvelope(envelope, "completeDocumentSave")) return
        ioScope.launch {
            writeEnvelopeToUri(uri, envelope, "completeDocumentSave")
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
            Log.d("NativeBridge", "completeDocumentLoad: read bytes=${content.length}")
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
