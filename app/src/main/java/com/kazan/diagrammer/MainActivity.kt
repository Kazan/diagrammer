@file:Suppress("DEPRECATION")

package com.kazan.diagrammer

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Build
import android.provider.DocumentsContract
import android.util.Log
import android.view.View
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.kazan.diagrammer.databinding.ActivityMainBinding
import com.kazan.diagrammer.di.IoDispatcher
import com.kazan.diagrammer.di.MainHandler
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Suppress("DEPRECATION")
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var assetLoader: WebViewAssetLoader
    private var nativeBridge: NativeBridge? = null
    private val dateFormat = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
    @Inject
    @IoDispatcher
    lateinit var ioDispatcher: CoroutineDispatcher

    @Inject
    @MainHandler
    lateinit var mainHandler: Handler

    private val ioScope: CoroutineScope by lazy { CoroutineScope(ioDispatcher + Job()) }
    private val prefs by lazy {
        getSharedPreferences("diagrammer_prefs", Context.MODE_PRIVATE)
    }

    private val createDocumentLauncher = registerForActivityResult(
        CreateSceneDocumentContract(::pickerInitialUri)
    ) { uri ->
        nativeBridge?.completeDocumentSave(uri)
        enterImmersive()
    }

    private val openDocumentLauncher = registerForActivityResult(
        OpenSceneDocumentContract(::pickerInitialUri)
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
            // Disable Android's long-click handling completely to let Excalidraw's
            // context menu work on e-ink devices (e.g. Boox Air 4C) where long-press
            // is translated to a right-click/contextmenu event by the firmware.
            setOnLongClickListener { true }
            isLongClickable = false
            isHapticFeedbackEnabled = false
            webViewClient = DiagrammerWebViewClient()
            webChromeClient = DiagrammerWebChromeClient()
            addJavascriptInterface(
                NativeBridge(
                    context = this@MainActivity,
                    ioScope = ioScope,
                    mainHandler = mainHandler,
                    webView = this,
                    startDocumentPicker = { envelope ->
                        val suggested = envelope.suggestedName?.takeIf { it.isNotBlank() }
                            ?: "diagram_${dateFormat.format(Date())}.excalidraw"
                        promptSaveTargetChoice(suggested)
                    },
                    startOpenDocument = {
                        exitImmersive()
                        openDocumentLauncher.launch(arrayOf("application/json", "application/octet-stream", "*/*"))
                    },
                    rememberPickerUri = ::rememberPickerUri
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

        // onCreate ends here; keep additional lifecycle callbacks top-level.
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

    private fun pickerInitialUri(): Uri? =
        runCatching { prefs.getString(KEY_LAST_PICKER_URI, null)?.let(Uri::parse) }.getOrNull()

    private fun rememberPickerUri(uri: Uri) {
        prefs.edit().putString(KEY_LAST_PICKER_URI, uri.toString()).apply()
    }

    private fun promptSaveTargetChoice(suggestedName: String) {
        // Launch the document picker directly. Android's CreateDocument picker allows
        // users to either type a new filename or select an existing file to overwrite
        // (with Android's built-in overwrite confirmation).
        exitImmersive()
        createDocumentLauncher.launch(suggestedName)
    }

    // No upfront directory grant; rely on user-selected locations via picker.

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

        override fun onPageStarted(
            view: WebView?,
            url: String?,
            favicon: android.graphics.Bitmap?
        ) {
            super.onPageStarted(view, url, favicon)
            // Inject native state before React app mounts.
            // This allows the web app to detect native context synchronously on startup.
            view?.evaluateJavascript(
                """
                window.__NATIVE_PRESENT__ = true;
                window.__NATIVE_APP_VERSION__ = '${BuildConfig.VERSION_NAME}';
                window.__NATIVE_PLATFORM__ = 'android';
                """.trimIndent(),
                null
            )
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            // Show native status chip when page is ready
            binding.nativeStatusChip.visibility = View.VISIBLE
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
                val tag = "DiagrammerWebView"
                val text = "${message.messageLevel()}: ${message.message()} @ ${message.sourceId()}:${message.lineNumber()}"
                Log.d(tag, text)
                // Also mirror to NativeBridge tag for unified capture in e2e logs.
                Log.d("NativeBridge", "[webview-console] ${text}")
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

private class CreateSceneDocumentContract(
    private val initialUriProvider: () -> Uri?
) : ActivityResultContracts.CreateDocument("application/vnd.excalidraw+json") {
    override fun createIntent(context: Context, input: String): Intent {
        return super.createIntent(context, input).apply {
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUriProvider())
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
    }
}

private class OpenSceneDocumentContract(
    private val initialUriProvider: () -> Uri?
) : ActivityResultContract<Array<String>, Uri?>() {
    override fun createIntent(context: Context, input: Array<String>): Intent {
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, input)
            putExtra(DocumentsContract.EXTRA_INITIAL_URI, initialUriProvider())
            addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            )
        }
    }

    override fun parseResult(resultCode: Int, intent: Intent?): Uri? {
        return ActivityResultContracts.OpenDocument().parseResult(resultCode, intent)
    }
}


private const val KEY_LAST_PICKER_URI = "last_picker_uri"
