package com.vflorio.supervisoragent.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Il broadcast non arriva se l'app e' in "stopped state", cioe' se non e' mai stata aperta
// dopo l'installazione: il setup deve lanciarla una volta.
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        EventLog.load(context)
        EventLog.info(context, "Boot completed")
        AgentService.start(context, "boot")
    }
}
