package com.programasdteme.okapisunmi

import android.app.Presentation
import android.content.Context
import android.os.Bundle
import android.view.Display
import android.view.LayoutInflater
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject

class CustomerDisplayPresentation(
  context: Context,
  display: Display,
) : Presentation(context, display) {
  private lateinit var brandView: TextView
  private lateinit var emptyView: TextView
  private lateinit var scrollView: View
  private lateinit var linesContainer: LinearLayout
  private lateinit var totalRow: View
  private lateinit var totalView: TextView
  private lateinit var subtitleView: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.presentation_customer_display)
    brandView = findViewById(R.id.customer_display_brand)
    emptyView = findViewById(R.id.customer_display_empty)
    scrollView = findViewById(R.id.customer_display_scroll)
    linesContainer = findViewById(R.id.customer_display_lines)
    totalRow = findViewById(R.id.customer_display_total_row)
    totalView = findViewById(R.id.customer_display_total)
    subtitleView = findViewById(R.id.customer_display_subtitle)
    showEmpty()
  }

  fun updateCart(payloadJson: String) {
    val root = JSONObject(payloadJson)
    val brandName = root.optString("brandName", context.getString(R.string.app_name))
    val currencySymbol = root.optString("currencySymbol", "Q")
    val total = root.optDouble("total", 0.0)
    val lines = root.optJSONArray("lines") ?: JSONArray()

    brandView.text = brandName
    subtitleView.text = context.getString(R.string.customer_display_subtitle)

    if (lines.length() == 0) {
      showEmpty()
      return
    }

    emptyView.visibility = View.GONE
    scrollView.visibility = View.VISIBLE
    totalRow.visibility = View.VISIBLE
    linesContainer.removeAllViews()
    val inflater = LayoutInflater.from(context)

    for (index in 0 until lines.length()) {
      val line = lines.getJSONObject(index)
      val row = inflater.inflate(R.layout.item_customer_display_line, linesContainer, false)
      val qtyView = row.findViewById<TextView>(R.id.customer_line_qty)
      val nameView = row.findViewById<TextView>(R.id.customer_line_name)
      val totalLineView = row.findViewById<TextView>(R.id.customer_line_total)
      val detailView = row.findViewById<TextView>(R.id.customer_line_detail)

      val quantity = line.optInt("quantity", 1)
      val name = line.optString("name", "Producto")
      val lineTotal = line.optDouble("lineTotal", 0.0)
      val detail = line.optString("detail", "").trim()

      qtyView.text = "${quantity}x"
      nameView.text = name
      totalLineView.text = "$currencySymbol ${"%.2f".format(lineTotal)}"

      if (detail.isNotEmpty()) {
        detailView.visibility = View.VISIBLE
        detailView.text = detail
      } else {
        detailView.visibility = View.GONE
      }

      linesContainer.addView(row)
    }

    totalView.text = "$currencySymbol ${"%.2f".format(total)}"
  }

  fun showEmpty() {
    emptyView.visibility = View.VISIBLE
    scrollView.visibility = View.GONE
    totalRow.visibility = View.GONE
    linesContainer.removeAllViews()
    totalView.text = ""
  }
}