package com.vflorio.supervisoragent.agent

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Settings

// Settings.Global: richiedono WRITE_SECURE_SETTINGS, protection level `development` - non
// ottenibile installando, concesso una tantum dall'host con `pm grant` e perso solo alla
// disinstallazione.
private const val ADB_WIFI_ENABLED = "adb_wifi_enabled"
private const val ADB_ENABLED = "adb_enabled"

object AdbSettings {

    sealed interface Outcome {
        data object AlreadyEnabled : Outcome
        data object Enabled : Outcome
        data object PermissionDenied : Outcome
        data class Failed(val reason: String) : Outcome
    }

    data class Status(
        val hasPermission: Boolean,
        val wifiDebugging: Int?,
        val usbDebugging: Int?,
    )

    fun hasPermission(context: Context): Boolean =
        context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) == PackageManager.PERMISSION_GRANTED

    fun status(context: Context): Status =
        Status(
            hasPermission = hasPermission(context),
            wifiDebugging = read(context, ADB_WIFI_ENABLED),
            usbDebugging = read(context, ADB_ENABLED),
        )

    fun enableWifiDebugging(context: Context): Outcome = ensure(context, ADB_WIFI_ENABLED)

    // Lifeline: senza, un wireless caduto lascia il device raggiungibile solo fisicamente.
    fun enableUsbDebugging(context: Context): Outcome = ensure(context, ADB_ENABLED)

    private fun read(context: Context, key: String): Int? =
        Settings.Global.getInt(context.contentResolver, key, -1).takeIf { it >= 0 }

    // Scrive solo a valore diverso: riscrivere 1 su 1 farebbe ripartire adbd su una porta
    // nuova a ogni evento di rete, invalidando il target che il supervisor ha appena risolto.
    private fun ensure(context: Context, key: String): Outcome {
        if (!hasPermission(context)) return Outcome.PermissionDenied
        if (read(context, key) == 1) return Outcome.AlreadyEnabled

        return runCatching { Settings.Global.putInt(context.contentResolver, key, 1) }
            .fold(
                onSuccess = { written -> if (written) Outcome.Enabled else Outcome.Failed("putInt returned false") },
                onFailure = { error -> Outcome.Failed(error.message ?: error::class.java.simpleName) },
            )
    }
}
