package com.programasdteme.okapisunmi

import android.webkit.JavascriptInterface
import org.json.JSONObject

class SunmiJsBridge(private val printerManager: SunmiPrinterManager) {
  @JavascriptInterface
  fun isAvailable(): String {
    return success(printerManager.isAvailable())
  }

  @JavascriptInterface
  fun printReceipt(payload: String): String {
    return try {
      val document = ReceiptDocument.fromJson(payload)
      val result = printerManager.print(document)
      if (result.success) {
        success(true)
      } else {
        error(result.message ?: "La impresion SUNMI fallo.")
      }
    } catch (error: Exception) {
      error(error.message ?: "No fue posible preparar el ticket para la impresora SUNMI.")
    }
  }

  private fun success(value: Boolean): String {
    return JSONObject()
      .put("success", true)
      .put("value", value)
      .toString()
  }

  private fun error(message: String): String {
    return JSONObject()
      .put("success", false)
      .put("message", message)
      .toString()
  }
}
