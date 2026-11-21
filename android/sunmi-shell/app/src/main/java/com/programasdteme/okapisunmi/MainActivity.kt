package com.programasdteme.okapisunmi

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.net.URI

class MainActivity : AppCompatActivity() {
  private lateinit var webView: WebView
  private lateinit var printerManager: SunmiPrinterManager

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.activity_main)

    printerManager = SunmiPrinterManager(applicationContext)
    printerManager.start()

    webView = findViewById(R.id.main_webview)
    configureWebView()

    if (savedInstanceState == null) {
      webView.loadUrl(BuildConfig.APP_URL)
    } else {
      webView.restoreState(savedInstanceState)
    }
  }

  override fun onDestroy() {
    printerManager.stop()
    super.onDestroy()
  }

  override fun onSaveInstanceState(outState: Bundle) {
    webView.saveState(outState)
    super.onSaveInstanceState(outState)
  }

  @Deprecated("Deprecated in Java")
  override fun onBackPressed() {
    if (this::webView.isInitialized && webView.canGoBack()) {
      webView.goBack()
      return
    }
    super.onBackPressed()
  }

  private fun configureWebView() {
    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    webView.settings.allowFileAccess = false
    webView.settings.allowContentAccess = false
    webView.settings.setSupportZoom(false)
    webView.settings.displayZoomControls = false
    webView.settings.userAgentString = webView.settings.userAgentString + " OkapiSunmiShell/1.0"

    webView.addJavascriptInterface(SunmiJsBridge(printerManager), "AndroidSunmiPrinter")
    webView.webChromeClient = WebChromeClient()
    webView.webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        injectSunmiBridge()
      }

      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val targetUrl = request?.url?.toString() ?: return false
        if (isAllowedInWebView(targetUrl)) {
          return false
        }

        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(targetUrl)))
        return true
      }
    }
  }

  private fun injectSunmiBridge() {
    val script = """
      (function() {
        const parseResult = (raw) => {
          const result = JSON.parse(raw);
          if (!result.success) {
            throw new Error(result.message || 'SUNMI bridge error');
          }
          return result.value;
        };

        window.SunmiPrinter = {
          __native: true,
          isAvailable: () => Promise.resolve(parseResult(AndroidSunmiPrinter.isAvailable())),
          printReceipt: (document) => Promise.resolve(parseResult(AndroidSunmiPrinter.printReceipt(JSON.stringify(document)))).then(() => undefined),
        };

        window.dispatchEvent(new Event('sunmi-printer-ready'));
      })();
    """.trimIndent()

    webView.evaluateJavascript(script, null)
  }

  private fun isAllowedInWebView(targetUrl: String): Boolean {
    val appHost = runCatching { URI(BuildConfig.APP_URL).host }.getOrNull()
    val targetHost = runCatching { URI(targetUrl).host }.getOrNull()
    return targetHost != null && targetHost == appHost
  }
}
