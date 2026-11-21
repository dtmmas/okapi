package com.programasdteme.okapisunmi

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.BitmapFactory
import android.util.Base64
import android.os.IBinder
import android.os.RemoteException
import woyou.aidlservice.jiuiv5.IWoyouService

data class PrintResult(
  val success: Boolean,
  val message: String? = null,
)

class SunmiPrinterManager(private val context: Context) {
  private var printerService: IWoyouService? = null

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
      printerService = IWoyouService.Stub.asInterface(service)
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      printerService = null
    }
  }

  fun start() {
    bind()
  }

  fun stop() {
    try {
      context.unbindService(connection)
    } catch (_: IllegalArgumentException) {
    }
    printerService = null
  }

  fun isAvailable(): Boolean {
    if (printerService != null) {
      return true
    }
    bind()
    return printerService != null
  }

  private var lineWidth = 42

  @Synchronized fun print(document: ReceiptDocument): PrintResult {
    lineWidth = when (document.paperWidthMm) {
      57, 58 -> 30
      76 -> 40
      else -> 42
    }
    val service = printerService ?: return PrintResult(false, "La impresora SUNMI no esta enlazada.")

    return try {
      service.printerInit(null)
      document.logoPng?.let { printLogo(service, it) }
      service.setFontSize(36f, null)
      printCentered(service, document.brandName, lineWidth * 2 / 3)
      service.setFontSize(24f, null)
      document.brandLines.forEach { printCentered(service, it) }
      printCentered(service, document.title)
      printCentered(service, document.printedAt)

      printDivider(service)
      printLeft(service, document.metadata.joinToString("\n") { "${it.label}: ${it.value}" })
      printDivider(service)

      if (document.items.isNotEmpty()) {
        document.items.forEach { item ->
          printColumns(service, item.left, item.right.orEmpty())
          item.note?.let { note ->
            wrapText("  ${note}", lineWidth).forEach { printLeft(service, it) }
          }
        }
      } else {
        printLeft(service, document.emptyItemsLabel ?: "Sin items.")
      }

      if (document.summary.isNotEmpty()) {
        printDivider(service)
        document.summary.forEach { item ->
          printColumns(service, item.label, item.value)
        }
        document.summaryNote?.let {
          service.setAlignment(ALIGN_CENTER, null)
          wrapText(it, lineWidth).forEach { line -> service.printText(line + "\n", null) }
          service.setAlignment(ALIGN_LEFT, null)
        }
      }

      document.sections.forEach { section ->
        printDivider(service)
        section.title?.let { printLeft(service, it) }
        section.entries.forEach { entry ->
          entry.title?.let { printLeft(service, it) }
          entry.lines.forEach { line -> printLeft(service, line) }
        }
      }

      document.footerLabel?.let {
        printDivider(service)
        printCentered(service, it)
      }

      service.lineWrap(3, null)
      try {
        service.cutPaper(null)
      } catch (_: Throwable) {
      }

      PrintResult(true)
    } catch (error: RemoteException) {
      PrintResult(false, error.message ?: "No fue posible enviar el ticket a la impresora SUNMI.")
    }
  }

  private fun bind() {
    val intent = Intent().apply {
      setPackage(SUNMI_PRINTER_PACKAGE)
      action = SUNMI_PRINTER_ACTION
    }
    context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
  }

  private fun printDivider(service: IWoyouService) {
    printLeft(service, "-".repeat(lineWidth))
  }

  private fun printLogo(service: IWoyouService, data: String) {
    val bytes = try {
      Base64.decode(data.substringAfter(','), Base64.DEFAULT)
    } catch (_: IllegalArgumentException) {
      return
    }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth !in 1..448 || bounds.outHeight !in 1..256) return
    val image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return
    try {
      service.setAlignment(ALIGN_CENTER, null)
      service.printBitmap(image, null)
    } finally {
      image.recycle()
    }
  }

  private fun printLeft(service: IWoyouService, text: String) {
    service.setAlignment(ALIGN_LEFT, null)
    wrapText(text, lineWidth).forEach { line ->
      service.printText(line + "\n", null)
    }
  }

  private fun printCentered(service: IWoyouService, text: String, width: Int = lineWidth) {
    service.setAlignment(ALIGN_CENTER, null)
    wrapText(text, width).forEach { line ->
      service.printText(line + "\n", null)
    }
    service.setAlignment(ALIGN_LEFT, null)
  }

  private fun printColumns(service: IWoyouService, left: String, right: String) {
    if (right.isBlank()) {
      printLeft(service, left)
      return
    }

    val leftWidth = lineWidth - RIGHT_WIDTH - 1
    val leftLines = wrapText(left, leftWidth)
    val rightLines = wrapText(right, RIGHT_WIDTH)
    val rows = maxOf(leftLines.size, rightLines.size)

    repeat(rows) { index ->
      val leftValue = leftLines.getOrElse(index) { "" }
      val rightValue = rightLines.getOrElse(index) { "" }
      val line = leftValue.padEnd(leftWidth) + " " + rightValue.padStart(RIGHT_WIDTH)
      service.setAlignment(ALIGN_LEFT, null)
      service.printText(line + "\n", null)
    }
  }

  private fun wrapText(text: String, width: Int): List<String> {
    if (text.isBlank()) {
      return listOf("")
    }

    val normalized = text.replace("\r", "")
    val lines = mutableListOf<String>()

    normalized.split("\n").forEach paragraphLoop@{ paragraph ->
      if (paragraph.length <= width) {
        lines += paragraph
        return@paragraphLoop
      }

      var current = ""
      paragraph.split(" ").forEach wordLoop@{ word ->
        if (word.length > width) {
          if (current.isNotBlank()) {
            lines += current
            current = ""
          }
          chunkWord(word, width).forEach { chunk -> lines += chunk }
          return@wordLoop
        }

        val candidate = if (current.isBlank()) word else "$current $word"
        if (candidate.length > width) {
          lines += current
          current = word
        } else {
          current = candidate
        }
      }

      if (current.isNotBlank()) {
        lines += current
      }
    }

    return lines.ifEmpty { listOf("") }
  }

  private fun chunkWord(word: String, width: Int): List<String> {
    if (word.length <= width) {
      return listOf(word)
    }
    return buildList {
      var index = 0
      while (index < word.length) {
        val nextIndex = minOf(index + width, word.length)
        add(word.substring(index, nextIndex))
        index = nextIndex
      }
    }
  }

  companion object {
    private const val SUNMI_PRINTER_PACKAGE = "woyou.aidlservice.jiuiv5"
    private const val SUNMI_PRINTER_ACTION = "woyou.aidlservice.jiuiv5.IWoyouService"
    private const val ALIGN_LEFT = 0
    private const val ALIGN_CENTER = 1
    private const val RIGHT_WIDTH = 12
  }
}
