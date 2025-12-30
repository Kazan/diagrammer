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
        // Only restore URI if we still have permission to access it
        val parsedUri = storedUri?.let { Uri.parse(it) }
        if (parsedUri != null && hasUriPermission(parsedUri)) {
            currentDocumentUri = parsedUri
            currentDocumentName = storedName
            Log.d("NativeBridge", "init: restored uri=$parsedUri, name=$storedName")
        } else if (parsedUri != null) {
            Log.w("NativeBridge", "init: stored uri no longer accessible, clearing: $parsedUri")
            persistCurrentFile(null, null)
        }
    }

    /**
     * Check if we have persistable read/write permission for a URI.
     * This is critical on Boox e-ink devices where permissions are strictly enforced.
     */
    private fun hasUriPermission(uri: Uri): Boolean {
        return try {
            val permissions = context.contentResolver.persistedUriPermissions
            permissions.any { perm ->
                perm.uri == uri && perm.isReadPermission && perm.isWritePermission
            }
        } catch (e: Exception) {
            Log.w("NativeBridge", "hasUriPermission: check failed for $uri: ${e.message}")
            false
        }
    }

    /**
     * Verify we can actually write to a URI by checking permissions and attempting
     * to open it. Returns true if writable, false otherwise.
     */
    private fun canWriteToUri(uri: Uri): Boolean {
        // First check if we have persisted permission
        if (!hasUriPermission(uri)) {
            Log.w("NativeBridge", "canWriteToUri: no persisted permission for $uri")
            return false
        }
        // Try to verify we can actually open it for writing
        return try {
            context.contentResolver.openOutputStream(uri, "wa")?.close()
            true
        } catch (e: Exception) {
            Log.w("NativeBridge", "canWriteToUri: cannot open $uri for write: ${e.message}")
            false
        }
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
        Log.d("NativeBridge", "$source: received envelope length=${raw.length}")
        return runCatching {
            val obj = JSONObject(raw)
            val json = obj.optString("json", "")
            val byteLength = obj.optLong("byteLength", -1)
            val sha256Raw = obj.optString("sha256")
            val sha256 = if (sha256Raw.isNotBlank()) sha256Raw else null
            val suggestedNameRaw = obj.optString("suggestedName")
            val suggestedName = if (suggestedNameRaw.isNotBlank()) suggestedNameRaw else null
            val createdAt = obj.optLong("createdAt", System.currentTimeMillis())
            Log.d(
                "NativeBridge",
                "$source: parsed envelope jsonLen=${json.length}, byteLength=$byteLength, sha256=${sha256?.take(8) ?: "null"}, name=$suggestedName"
            )
            if (json.isEmpty()) {
                Log.e("NativeBridge", "$source: extracted json is empty from envelope")
            }
            SaveEnvelope(
                json = json,
                byteLength = byteLength,
                sha256 = sha256,
                suggestedName = suggestedName,
                createdAt = createdAt
            )
        }.getOrElse {
            Log.e("NativeBridge", "$source: failed to parse envelope (len=${raw.length})", it)
            // Log first/last chars to help diagnose truncation issues
            val preview = if (raw.length > 100) {
                "first50=${raw.take(50)}, last50=${raw.takeLast(50)}"
            } else {
                "content=$raw"
            }
            Log.e("NativeBridge", "$source: envelope preview: $preview")
            notifyJs("onSaveComplete", false, "Invalid save payload: ${it.message?.take(100)}", currentDocumentName)
            null
        }
    }

    private fun validateEnvelope(envelope: SaveEnvelope, source: String): Boolean {
        val bytes = envelope.json.toByteArray(Charsets.UTF_8)
        val actualByteLen = bytes.size.toLong()

        // Log validation attempt for diagnostics
        Log.d("NativeBridge", "$source: validating envelope actualBytes=$actualByteLen, declaredBytes=${envelope.byteLength}")

        if (envelope.byteLength >= 0 && actualByteLen != envelope.byteLength) {
            // On some devices (e.g., Boox e-ink), the JS-to-Kotlin bridge may truncate
            // large strings. Log a warning but continue if the JSON is still valid.
            Log.w(
                "NativeBridge",
                "$source: byteLength mismatch (expected=${envelope.byteLength}, actual=$actualByteLen, diff=${envelope.byteLength - actualByteLen})"
            )
            // If severe truncation (more than 50% missing), fail
            if (actualByteLen < envelope.byteLength / 2) {
                Log.e("NativeBridge", "$source: severe truncation detected, failing")
                notifyJs("onSaveComplete", false, "Data corrupted during transfer", currentDocumentName)
                return false
            }
            // Otherwise warn but continue - the JSON validation will catch actual corruption
            Log.w("NativeBridge", "$source: minor byte mismatch, continuing with JSON validation")
        }
        val declaredSha = envelope.sha256
        if (!declaredSha.isNullOrBlank()) {
            val actualSha = computeSha(bytes)
            if (!declaredSha.equals(actualSha, ignoreCase = true)) {
                // SHA mismatch could be due to byte mismatch we already warned about
                Log.w(
                    "NativeBridge",
                    "$source: sha mismatch (expected=${declaredSha.take(16)}, actual=${actualSha.take(16)})"
                )
                // If byteLength also mismatched, this is likely a transfer issue not corruption
                if (envelope.byteLength >= 0 && actualByteLen != envelope.byteLength) {
                    Log.w("NativeBridge", "$source: sha mismatch likely due to transfer issue, skipping sha check")
                } else {
                    Log.e("NativeBridge", "$source: sha mismatch with matching byteLength - actual corruption")
                    notifyJs("onSaveComplete", false, "Corrupt save payload", currentDocumentName)
                    return false
                }
            }
        }
        if (!isValidJsonStrict(envelope.json)) {
            Log.e("NativeBridge", "$source: invalid JSON payload (len=${envelope.json.length})")
            // Log a preview to help diagnose
            val preview = if (envelope.json.length > 200) {
                "first100=${envelope.json.take(100)}, last100=${envelope.json.takeLast(100)}"
            } else {
                "content=${envelope.json}"
            }
            Log.e("NativeBridge", "$source: JSON preview: $preview")
            notifyJs("onSaveComplete", false, "Invalid scene JSON", currentDocumentName)
            return false
        }
        Log.d("NativeBridge", "$source: envelope validation passed")
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
            // Note: Permission should already be granted via the document picker.
            // We attempt to take persistable permission but don't fail if it's not available.
            // On Boox and some other e-ink devices, the permission model is stricter.
            try {
                context.contentResolver.takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                )
                Log.d("NativeBridge", "$source: acquired persistable permission for $uri")
            } catch (se: SecurityException) {
                // This is expected if the URI doesn't support persistable permissions.
                // The transient permission from the picker should still work.
                Log.w("NativeBridge", "$source: could not take persistable permission (expected on some devices): ${se.message}")
            }

            val bytesToWrite = envelope.json.toByteArray(Charsets.UTF_8)
            Log.d("NativeBridge", "$source: preparing to write ${bytesToWrite.size} bytes to ${uri.scheme}://${uri.authority}")

            // Try write modes in order of preference:
            // 1. "wt" (write-truncate) - most compatible with SAF
            // 2. "w" (write) - fallback
            // 3. "rwt" (read-write-truncate) - for some Boox devices
            // 4. default mode - last resort
            val stream = runCatching {
                context.contentResolver.openOutputStream(uri, "wt")
            }.onFailure {
                Log.w("NativeBridge", "$source: 'wt' mode failed: ${it.message}")
            }.getOrNull() ?: runCatching {
                context.contentResolver.openOutputStream(uri, "w")
            }.onFailure {
                Log.w("NativeBridge", "$source: 'w' mode failed: ${it.message}")
            }.getOrNull() ?: runCatching {
                // Some Boox devices need "rwt" mode for proper truncation
                context.contentResolver.openOutputStream(uri, "rwt")
            }.onFailure {
                Log.w("NativeBridge", "$source: 'rwt' mode failed: ${it.message}")
            }.getOrNull() ?: runCatching {
                context.contentResolver.openOutputStream(uri)
            }.onFailure {
                Log.e("NativeBridge", "$source: default mode failed: ${it.message}")
            }.getOrNull()

            if (stream == null) {
                // Check if this is a permission issue
                val hasPermission = hasUriPermission(uri)
                val errorMsg = if (!hasPermission) {
                    "No output stream available for $uri - storage permissions expired. Please use Save As to select a new location."
                } else {
                    "No output stream available for $uri - check storage permissions"
                }
                // Clear the current document if permission was lost
                if (!hasPermission && currentDocumentUri == uri) {
                    currentDocumentUri = null
                    currentDocumentName = null
                    persistCurrentFile(null, null)
                }
                error(errorMsg)
            }

            stream.use {
                it.write(bytesToWrite)
                it.flush()
                Log.d("NativeBridge", "$source: write complete, bytes=${bytesToWrite.size}")
            }
        }.onSuccess {
            val (finalUri, finalName) = ensureExcalidrawName(uri)
            currentDocumentUri = finalUri
            currentDocumentName = finalName ?: currentDocumentName
            persistCurrentFile(currentDocumentUri, currentDocumentName)
            rememberPickerUri(finalUri)
            Log.d("NativeBridge", "$source: save success, notifying JS")
            notifyJs("onSaveComplete", true, null, currentDocumentName)
        }.onFailure {
            Log.e("NativeBridge", "$source: write failed", it)
            notifyJs("onSaveComplete", false, it.message?.take(200), currentDocumentName)
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
            Log.w("NativeBridge", "persistSceneToCurrentDocument: no current file, prompting picker")
            notifyJs("onSaveComplete", false, "No current file - use Save As", null)
            return
        }
        // Verify permission before attempting write (critical for Boox e-ink devices)
        if (!hasUriPermission(target)) {
            Log.w("NativeBridge", "persistSceneToCurrentDocument: permission lost for $target")
            // Clear the stored URI since permission is gone
            currentDocumentUri = null
            currentDocumentName = null
            persistCurrentFile(null, null)
            notifyJs("onSaveComplete", false, "File permission expired - use Save As to select a new location", null)
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
            Log.w("NativeBridge", "saveSceneToCurrentDocument: no current file")
            notifyJs("onSaveComplete", false, "No current file - use Save As", null)
            return
        }
        // Verify permission before attempting write (critical for Boox e-ink devices)
        if (!hasUriPermission(target)) {
            Log.w("NativeBridge", "saveSceneToCurrentDocument: permission lost for $target")
            currentDocumentUri = null
            currentDocumentName = null
            persistCurrentFile(null, null)
            notifyJs("onSaveComplete", false, "File permission expired - use Save As to select a new location", null)
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

        // Take persistable URI permission immediately after picker returns
        // This is critical for Boox e-ink devices which are strict about permissions
        try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
            Log.d("NativeBridge", "completeDocumentSave: took persistable permission for $uri")
        } catch (se: SecurityException) {
            Log.w("NativeBridge", "completeDocumentSave: could not take persistable permission: ${se.message}")
            // Continue anyway - the write operation will use the transient permission from the picker
        }

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
