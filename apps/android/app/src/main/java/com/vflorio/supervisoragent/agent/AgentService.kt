package com.vflorio.supervisoragent.agent

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.SystemClock
import com.vflorio.supervisoragent.MainActivity
import com.vflorio.supervisoragent.R

// Foreground service e non un receiver nel manifest: CONNECTIVITY_ACTION e' deprecato e non
// piu' consegnato in modo affidabile, e WorkManager ha granularita' di 15 minuti - troppo
// lenta per un device che il supervisor sta cercando di recuperare.
class AgentService : Service() {

    private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }

    // Thread unico per ogni riscrittura: i trigger arrivano da thread diversi e il check-then-act
    // di AdbSettings non e' atomico. Al boot si sovrappongono sempre, perche' registerNetworkCallback
    // consegna onAvailable per la rete gia' connessa mentre onStartCommand sta ancora girando: due
    // write ravvicinate fanno ripartire adbd due volte, su due porte TLS diverse, invalidando il
    // target che il supervisor ha appena risolto via mDNS.
    private val worker = HandlerThread("agent-reconcile").apply { start() }

    private val handler by lazy { Handler(worker.looper) }

    private val reconcileToken = Any()

    // Il framework riscrive le chiavi a 0 per conto suo e nessun evento di rete lo segnala: senza
    // observer il device resta fuori dall'annuncio mDNS fino al reboot successivo.
    private val observer by lazy {
        object : ContentObserver(handler) {
            override fun onChange(selfChange: Boolean, uri: Uri?) = schedule("settings changed")
        }
    }

    // Rete di sicurezza per cio' che non genera alcun evento: roaming tra AP della stessa rete, o
    // observer perso perche' il processo e' stato ricreato a riscrittura gia' avvenuta.
    private val tick = object : Runnable {
        override fun run() {
            schedule("periodic", delayMs = 0)
            handler.postDelayed(this, RECONCILE_INTERVAL_MS)
        }
    }

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = schedule("network available")

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
        for (uri in AdbSettings.OBSERVED_URIS) contentResolver.registerContentObserver(uri, false, observer)
        // Primo giro fra un intervallo, non subito: all'avvio ci pensa gia' onStartCommand, e il
        // suo trigger e' quello che vale la pena leggere nel log.
        handler.postDelayed(tick, RECONCILE_INTERVAL_MS)

        EventLog.info(this, "Service started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        schedule(intent?.getStringExtra(EXTRA_TRIGGER) ?: "service start")
        // Ucciso sotto pressione di memoria, il device resterebbe muto fino al prossimo reboot.
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching { connectivity.unregisterNetworkCallback(callback) }
        runCatching { contentResolver.unregisterContentObserver(observer) }
        handler.removeCallbacksAndMessages(null)
        worker.quitSafely()
        EventLog.warn(this, "Service stopped")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // Un solo passaggio per finestra: i trigger si accavallano al boot, e il framework puo'
    // emettere piu' notifiche di seguito sulla stessa chiave.
    private fun schedule(trigger: String, delayMs: Long = RECONCILE_DEBOUNCE_MS) {
        handler.removeCallbacksAndMessages(reconcileToken)
        handler.postAtTime({ reconcile(trigger) }, reconcileToken, SystemClock.uptimeMillis() + delayMs)
    }

    // adb_enabled si riscrive sempre: e' la lifeline USB e nessuno lo tocca al variare della rete.
    // adb_wifi_enabled no: senza rete il framework lo riporta a 0 subito dopo ogni nostro 1 e i due
    // si rincorrerebbero. Le camere non hanno SIM, quindi niente WiFi significa fuori gioco
    // comunque, e al ritorno della rete ci pensa onAvailable.
    private fun reconcile(trigger: String) = reassertSettings(this, trigger, wifiDebugging = hasNetwork())

    private fun hasNetwork(): Boolean =
        connectivity.getNetworkCapabilities(connectivity.activeNetwork)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

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

        // Basso di proposito: serve solo a fondere trigger simultanei, non a ritardare la
        // riparazione - l'host rilegge lo stato ~3s dopo `am start`.
        private const val RECONCILE_DEBOUNCE_MS = 1_000L
        private const val RECONCILE_INTERVAL_MS = 60_000L

        fun start(context: Context, trigger: String) {
            createChannel(context)
            context.startForegroundService(
                Intent(context, AgentService::class.java).putExtra(EXTRA_TRIGGER, trigger),
            )
        }

        // Sincronizzato: il bottone della UI scrive dal main thread mentre il servizio riconcilia
        // sul suo worker, e il check-then-act di AdbSettings non regge due scritture in parallelo.
        @Synchronized
        fun reassertSettings(context: Context, trigger: String, wifiDebugging: Boolean = true) {
            EventLog.load(context)
            if (wifiDebugging) {
                report(context, "adb_wifi_enabled", AdbSettings.enableWifiDebugging(context), trigger)
            }
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
