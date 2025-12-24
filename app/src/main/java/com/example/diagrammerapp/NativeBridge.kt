package com.example.diagrammerapp

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.annotation.VisibleForTesting
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

internal data class SaveEnvelope(
    val json: String,
    val byteLength: Long,
    val sha256: String?,
    val suggestedName: String?,
    val createdAt: Long,
)

internal class NativeBridge(
    private val context: Context,
    private val ioScope: CoroutineScope,
    private val mainHandler: Handler,
    private val webView: WebView,
    private val startDocumentPicker: (SaveEnvelope) -> Unit,
    private val startOpenDocument: () -> Unit,
    private val rememberPickerUri: (Uri) -> Unit
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
            val sha256Raw = obj.optString("sha256")
            val sha256 = if (sha256Raw.isNotBlank()) sha256Raw else null
            val suggestedNameRaw = obj.optString("suggestedName")
            val suggestedName = if (suggestedNameRaw.isNotBlank()) suggestedNameRaw else null
            val createdAt = obj.optLong("createdAt", System.currentTimeMillis())
            SaveEnvelope(
                json = json,
                byteLength = byteLength,
                sha256 = sha256,
                suggestedName = suggestedName,
                createdAt = createdAt
            )
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
            when (trimmed.first()) {
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
            rememberPickerUri(finalUri)
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
            Log.d("NativeBridge", "persistScene: autosave disabled; skipping file write")
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

    @JavascriptInterface
    fun saveScene(json: String) {
        Log.d("NativeBridge", "saveScene (legacy) invoked")
        ioScope.launch {
            val envelope = legacyEnvelope(json, currentDocumentName)
            if (!validateEnvelope(envelope, "saveScene")) return@launch
            Log.d("NativeBridge", "saveScene (legacy): autosave disabled; skipping file write")
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
        Log.d("NativeBridge", "loadScene -> disabled (autosave removed)")
        return null
    }

    @JavascriptInterface
    fun exportPng(base64DataUrl: String) {
        ioScope.launch {
            val bytes = decodeBase64DataUrl(base64DataUrl) ?: run {
                notifyJs("onExportComplete", false, "Invalid PNG data", null)
                return@launch
            }
            Log.d("NativeBridge", "exportPng: bytes=${bytes.size}, dataUrlLength=${base64DataUrl.length}")
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
            Log.d("NativeBridge", "exportSvg: bytes=${bytes.size}, dataUrlLength=${base64DataUrl.length}")
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
            val (content, normalizedName) = runCatching {
                val text = context.contentResolver.openInputStream(uri)
                    ?.bufferedReader()
                    ?.use { it.readText() }
                text to (getDisplayName(uri) ?: uri.lastPathSegment)
            }.getOrNull() ?: (null to null)

            if (content == null) {
                notifyJs("onNativeMessage", false, "Unable to read file", null)
                return@launch
            }
            Log.d("NativeBridge", "completeDocumentLoad: uri=$uri bytes=${content.length}")
            if (uri.scheme != "file") {
                try {
                    context.contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )
                } catch (_: SecurityException) {
                    // ignore if not persistable
                }
            }

            currentDocumentUri = uri
            currentDocumentName = normalizedName
            persistCurrentFile(currentDocumentUri, currentDocumentName)
            rememberPickerUri(uri)
            val escaped = JSONObject.quote(content)
            val name = JSONObject.quote(currentDocumentName ?: "")
            val script = "window.NativeBridgeCallbacks && window.NativeBridgeCallbacks.onSceneLoaded(${escaped}, ${name});"
            mainHandler.post {
                Log.d("NativeBridge", "completeDocumentLoad: delivering to JS name=${currentDocumentName}")
                webView.evaluateJavascript(script, null)
            }
        }
    }

    @JavascriptInterface
    fun getCurrentFileName(): String? = currentDocumentName

    @VisibleForTesting
    internal fun setCurrentDocument(uri: Uri?, name: String?) {
        currentDocumentUri = uri
        currentDocumentName = name
    }
}
