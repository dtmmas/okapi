package com.programasdteme.okapisunmi

import android.content.Context
import android.hardware.display.DisplayManager
import android.media.MediaRouter
import android.os.Handler
import android.os.Looper
import android.view.Display

class CustomerDisplayManager(private val context: Context) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var presentation: CustomerDisplayPresentation? = null

  fun isAvailable(): Boolean = findPresentationDisplay() != null

  fun start() {
    mainHandler.post {
      val display = findPresentationDisplay() ?: return@post
      if (presentation?.isShowing == true) {
        return@post
      }
      presentation = CustomerDisplayPresentation(context, display).apply {
        show()
        showEmpty()
      }
    }
  }

  fun stop() {
    mainHandler.post {
      presentation?.dismiss()
      presentation = null
    }
  }

  fun updateCart(payloadJson: String) {
    mainHandler.post {
      ensurePresentation()
      presentation?.updateCart(payloadJson)
    }
  }

  fun clear() {
    mainHandler.post {
      ensurePresentation()
      presentation?.showEmpty()
    }
  }

  private fun ensurePresentation() {
    if (presentation?.isShowing == true) {
      return
    }
    val display = findPresentationDisplay() ?: return
    presentation = CustomerDisplayPresentation(context, display).apply {
      show()
    }
  }

  private fun findPresentationDisplay(): Display? {
    val displayManager = context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    val presentationDisplays = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
    if (presentationDisplays.isNotEmpty()) {
      return presentationDisplays[0]
    }

    val mediaRouter = context.getSystemService(Context.MEDIA_ROUTER_SERVICE) as MediaRouter
    @Suppress("DEPRECATION")
    val selected = mediaRouter.getSelectedRoute(MediaRouter.ROUTE_TYPE_LIVE_VIDEO)
    selected?.presentationDisplay?.let { return it }

    for (index in 0 until mediaRouter.routeCount) {
      @Suppress("DEPRECATION")
      val route = mediaRouter.getRouteAt(index)
      route.presentationDisplay?.let { return it }
    }

    return null
  }
}