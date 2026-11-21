package com.programasdteme.okapisunmi

import org.json.JSONArray
import org.json.JSONObject

data class ReceiptKeyValue(
  val label: String,
  val value: String,
)

data class ReceiptLineItem(
  val left: String,
  val right: String?,
  val note: String?,
)

data class ReceiptSectionEntry(
  val title: String?,
  val lines: List<String>,
)

data class ReceiptSection(
  val title: String?,
  val entries: List<ReceiptSectionEntry>,
)

data class ReceiptDocument(
  val title: String,
  val brandName: String,
  val brandLines: List<String>,
  val paperWidthMm: Int,
  val logoPng: String?,
  val printedAt: String,
  val metadata: List<ReceiptKeyValue>,
  val items: List<ReceiptLineItem>,
  val emptyItemsLabel: String?,
  val summary: List<ReceiptKeyValue>,
  val summaryNote: String?,
  val sections: List<ReceiptSection>,
  val footerLabel: String?,
) {
  companion object {
    fun fromJson(raw: String): ReceiptDocument {
      val root = JSONObject(raw)
      return ReceiptDocument(
        title = root.getString("title"),
        brandName = root.getString("brandName"),
        brandLines = parseStrings(root.optJSONArray("brandLines")),
        paperWidthMm = root.optInt("paperWidthMm", 80),
        logoPng = root.optString("logoPng").takeIf { it.startsWith("data:image/png;base64,") && it.length <= 640_000 },
        printedAt = root.getString("printedAt"),
        metadata = parseKeyValues(root.optJSONArray("metadata")),
        items = parseItems(root.optJSONArray("items")),
        emptyItemsLabel = root.optString("emptyItemsLabel").ifBlank { null },
        summary = parseKeyValues(root.optJSONArray("summary")),
        summaryNote = root.optString("summaryNote").ifBlank { null },
        sections = parseSections(root.optJSONArray("sections")),
        footerLabel = root.optString("footerLabel").ifBlank { null },
      )
    }

    private fun parseKeyValues(array: JSONArray?): List<ReceiptKeyValue> {
      if (array == null) {
        return emptyList()
      }
      return buildList {
        for (index in 0 until array.length()) {
          val item = array.getJSONObject(index)
          add(
            ReceiptKeyValue(
              label = item.getString("label"),
              value = item.getString("value"),
            ),
          )
        }
      }
    }

    private fun parseItems(array: JSONArray?): List<ReceiptLineItem> {
      if (array == null) {
        return emptyList()
      }
      return buildList {
        for (index in 0 until array.length()) {
          val item = array.getJSONObject(index)
          add(
            ReceiptLineItem(
              left = item.getString("left"),
              right = item.optString("right").ifBlank { null },
              note = item.optString("note").ifBlank { null },
            ),
          )
        }
      }
    }

    private fun parseSections(array: JSONArray?): List<ReceiptSection> {
      if (array == null) {
        return emptyList()
      }
      return buildList {
        for (index in 0 until array.length()) {
          val section = array.getJSONObject(index)
          add(
            ReceiptSection(
              title = section.optString("title").ifBlank { null },
              entries = parseSectionEntries(section.optJSONArray("entries")),
            ),
          )
        }
      }
    }

    private fun parseSectionEntries(array: JSONArray?): List<ReceiptSectionEntry> {
      if (array == null) {
        return emptyList()
      }
      return buildList {
        for (index in 0 until array.length()) {
          val entry = array.getJSONObject(index)
          add(
            ReceiptSectionEntry(
              title = entry.optString("title").ifBlank { null },
              lines = parseStrings(entry.optJSONArray("lines")),
            ),
          )
        }
      }
    }

    private fun parseStrings(array: JSONArray?): List<String> {
      if (array == null) {
        return emptyList()
      }
      return buildList {
        for (index in 0 until array.length()) {
          add(array.getString(index))
        }
      }
    }
  }
}
