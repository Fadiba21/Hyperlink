package com.tradepilotnative

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class TradePilotBackgroundModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "TradePilotBackground"

  @ReactMethod
  fun start() {
    val intent = Intent(reactContext, TradePilotForegroundService::class.java)
    ContextCompat.startForegroundService(reactContext, intent)
  }

  @ReactMethod
  fun stop() {
    reactContext.stopService(Intent(reactContext, TradePilotForegroundService::class.java))
  }

  @ReactMethod
  fun isRunning(promise: Promise) {
    promise.resolve(TradePilotForegroundService.running)
  }

  /** Heads-up alert for important events (signal, TP/SL hit, price alert). Silently ignored without notification permission. */
  @ReactMethod
  fun notify(title: String, body: String, id: Int) {
    try {
      val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = NotificationChannel(ALERT_CHANNEL, "Peringatan Hyperlink", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Signal, TP/SL, alert harga, serta status order penting saat event terpantau."
        }
        manager.createNotificationChannel(channel)
      }
      val launch = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
      val pending = launch?.let { PendingIntent.getActivity(reactContext, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
      val notification = NotificationCompat.Builder(reactContext, ALERT_CHANNEL)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setContentIntent(pending)
        .build()
      NotificationManagerCompat.from(reactContext).notify(7500 + (id and 0xFF), notification)
    } catch (_: SecurityException) {
    }
  }

  companion object {
    const val ALERT_CHANNEL = "xotrade-alerts"
  }
}
