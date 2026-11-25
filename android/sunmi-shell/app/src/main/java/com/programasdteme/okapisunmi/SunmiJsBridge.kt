package com.programasdteme.okapisunmi

import android.webkit.JavascriptInterface
import org.json.JSONObject

class SunmiJsBridge(
  private val printerManager: SunmiPrinterManager,
  private val customerDisplayManager: CustomerDisplayManager,
) {
  @JavascriptInterface
  fun isAvailable(): String {
    return success(printerManager.isAvailable())
  }

  @JavascriptInterface
  fun isCustomerDisplayAvailable(): String {
    return success(customerDisplayManager.isAvailable())
  }

  @JavascriptInterface
  fun updateCustomerDisplay(payload: String): String {
    return try {
      customerDisplayManager.updateCart(payload)
      success(true)
    } catch (error: Exception) {
      error(error.message ?: "No fue posible actualizar la pantalla del cliente.")
    }
  }

  @JavascriptInterface
  fun clearCustomerDisplay(): String {
    return try {
      customerDisplayManager.clear()
      success(true)
    } catch (error: Exception) {
      error(error.message ?: "No fue posible limpiar la pantalla del cliente.")
    }
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
