package com.vflorio.supervisoragent

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.vflorio.supervisoragent.agent.AdbSettings
import com.vflorio.supervisoragent.agent.AgentService
import com.vflorio.supervisoragent.agent.EventLog
import com.vflorio.supervisoragent.ui.theme.SupervisorAgentTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        EventLog.load(this)

        // Aprire l'app la toglie dallo "stopped state", senza il quale BOOT_COMPLETED non
        // verrebbe mai consegnato.
        AgentService.start(this, "app opened")

        enableEdgeToEdge()
        setContent {
            SupervisorAgentTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
                    AgentScreen(Modifier.padding(padding))
                }
            }
        }
    }
}

// Ogni riga mostrata deve essere una che *deve* essere verde: e' la stessa definizione di
// "sano" che il servizio interroghera' via adb. POST_NOTIFICATIONS resta fuori di proposito -
// e' negato apposta (notifica invisibile sui device di lab) e comparirebbe come falso allarme.
private data class Health(
    val settings: AdbSettings.Status,
    val batteryExempt: Boolean,
)

private fun health(context: Context) = Health(
    settings = AdbSettings.status(context),
    batteryExempt = context.getSystemService(PowerManager::class.java)
        .isIgnoringBatteryOptimizations(context.packageName),
)

@Composable
private fun AgentScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val entries by EventLog.entries.collectAsState()
    var state by remember { mutableStateOf(health(context)) }

    // Polling e non refresh su resume: il grant arriva dall'host mentre l'app e' gia' in
    // primo piano, e va visto comparire senza uscire e rientrare.
    LaunchedEffect(Unit) {
        while (true) {
            state = health(context)
            delay(1500)
        }
    }

    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        Text("Supervisor Agent", style = MaterialTheme.typography.headlineSmall)
        Text(
            "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(Modifier.size(16.dp))

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                StatusRow(
                    label = "WRITE_SECURE_SETTINGS",
                    ok = state.settings.hasPermission,
                    detail = if (state.settings.hasPermission) "granted" else "missing — run pm grant from host",
                )
                StatusRow(
                    label = "adb_wifi_enabled",
                    ok = state.settings.wifiDebugging == 1,
                    detail = describe(state.settings.wifiDebugging),
                )
                StatusRow(
                    label = "adb_enabled (USB)",
                    ok = state.settings.usbDebugging == 1,
                    detail = describe(state.settings.usbDebugging),
                )
                StatusRow(
                    label = "Battery optimization",
                    ok = state.batteryExempt,
                    detail = if (state.batteryExempt) "exempt" else "not exempt — service may be killed",
                )
            }
        }

        Spacer(Modifier.size(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                AgentService.reassertSettings(context, "manual")
                state = health(context)
            }) { Text("Apply now") }

            if (!state.batteryExempt) {
                OutlinedButton(onClick = { context.requestBatteryExemption() }) { Text("Battery") }
            }
        }

        Spacer(Modifier.size(20.dp))

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Log", style = MaterialTheme.typography.titleMedium)
            Text(
                "clear",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable { EventLog.clear(context) }.padding(top = 4.dp),
            )
        }

        Spacer(Modifier.size(8.dp))

        if (entries.isEmpty()) {
            Text("No events recorded.", style = MaterialTheme.typography.bodySmall)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(entries.asReversed()) { entry ->
                    Row {
                        Text(
                            entry.time,
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.size(8.dp))
                        Text(
                            entry.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = when (entry.level) {
                                EventLog.Level.ERROR -> MaterialTheme.colorScheme.error
                                EventLog.Level.WARN -> WARN
                                EventLog.Level.INFO -> MaterialTheme.colorScheme.onSurface
                            },
                        )
                    }
                }
            }
        }
    }
}

private val OK = Color(0xFF2E7D32)
private val BAD = Color(0xFFC62828)
private val WARN = Color(0xFFE65100)

private fun describe(value: Int?) = when (value) {
    1 -> "enabled"
    0 -> "disabled"
    else -> "unreadable"
}

@Composable
private fun StatusRow(label: String, ok: Boolean, detail: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Surface(color = if (ok) OK else BAD, shape = CircleShape, modifier = Modifier.size(10.dp)) {}
        Spacer(Modifier.size(10.dp))
        Column {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun Context.requestBatteryExemption() {
    startActivity(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")),
    )
}
