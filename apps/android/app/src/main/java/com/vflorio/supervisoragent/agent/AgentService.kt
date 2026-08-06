package com.vflorio.supervisoragent.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.IBinder
import com.vflorio.supervisoragent.MainActivity
import com.vflorio.supervisoragent.R

// Foreground service e non un receiver nel manifest: CONNECTIVITY_ACTION e' deprecato e non
// piu' consegnato in modo affidabile, e WorkManager ha granularita' di 15 minuti - troppo
// lenta per un device che il supervisor sta cercando di recuperare.
class AgentService : Service() {

    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            reassertSettings(this@AgentService, "network available")
        }

        override fun onLost(network: Network) {
            EventLog.warn(this@AgentService, "Network lost")
        }
    }

    override fun onCreate() {
        super.onCreate()
        EventLog.load(this)
        startForeground(NOTIFICATION_ID, notification())

        connectivity.registerNetworkCallback(
            NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
            callback,
        )
        EventLog.info(this, "Service started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        reassertSettings(this, intent?.getStringExtra(EXTRA_TRIGGER) ?: "service start")
        // Ucciso sotto pressione di memoria, il device resterebbe muto fino al prossimo reboot.
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { connectivity.unregisterNetworkCallback(callback) }
        EventLog.warn(this, "Service stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun notification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            .build()

    companion object {
        private const val CHANNEL_ID = "agent"
        private const val NOTIFICATION_ID = 1
        private const val EXTRA_TRIGGER = "trigger"

        fun start(context: Context, trigger: String) {
            createChannel(context)
            context.startForegroundService(
                Intent(context, AgentService::class.java).putExtra(EXTRA_TRIGGER, trigger),
            )
        }

        fun reassertSettings(context: Context, trigger: String) {
            EventLog.load(context)
            report(context, "adb_wifi_enabled", AdbSettings.enableWifiDebugging(context), trigger)
            report(context, "adb_enabled", AdbSettings.enableUsbDebugging(context), trigger)
        }

        private fun report(context: Context, key: String, outcome: AdbSettings.Outcome, trigger: String) {
            when (outcome) {
                // Caso normale a regime: senza il silenzio, ogni evento di rete seppellirebbe
                // le righe che contano.
                AdbSettings.Outcome.AlreadyEnabled -> Unit
                AdbSettings.Outcome.Enabled -> EventLog.info(context, "$key enabled ($trigger)")
                AdbSettings.Outcome.PermissionDenied ->
                    EventLog.error(context, "$key: WRITE_SECURE_SETTINGS not granted")
                is AdbSettings.Outcome.Failed ->
                    EventLog.error(context, "$key: write failed - ${outcome.reason}")
            }
        }

        private fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.notification_channel),
                NotificationManager.IMPORTANCE_LOW,
            )
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
