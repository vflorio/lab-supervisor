package com.vflorio.supervisoragent.agent

import android.content.Context
import android.util.Log
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// Persistito su file, non solo in memoria: gli eventi che contano (boot, cambio rete)
// avvengono quando l'app non e' aperta e il processo puo' essere gia' morto quando lo si apre.
object EventLog {

    private const val FILE_NAME = "agent-log.tsv"
    private const val MAX_ENTRIES = 300
    private const val TAG = "SupervisorAgent"

    enum class Level { INFO, WARN, ERROR }

    data class Entry(val at: Instant, val level: Level, val message: String) {
        val time: String get() = TIME_FORMAT.format(at)
    }

    private val TIME_FORMAT: DateTimeFormatter =
        DateTimeFormatter.ofPattern("dd/MM HH:mm:ss").withZone(ZoneId.systemDefault())

    private val _entries = MutableStateFlow<List<Entry>>(emptyList())
    val entries: StateFlow<List<Entry>> = _entries.asStateFlow()

    private val lock = Any()
    private var loaded = false

    fun load(context: Context) = synchronized(lock) {
        if (loaded) return@synchronized
        loaded = true
        _entries.value = runCatching { file(context).readLines().mapNotNull(::parse) }.getOrDefault(emptyList())
    }

    fun info(context: Context, message: String) = append(context, Level.INFO, message)

    fun warn(context: Context, message: String) = append(context, Level.WARN, message)

    fun error(context: Context, message: String) = append(context, Level.ERROR, message)

    fun clear(context: Context) = synchronized(lock) {
        _entries.value = emptyList()
        runCatching { file(context).delete() }
        Unit
    }

    private fun append(context: Context, level: Level, message: String) = synchronized(lock) {
        Log.i(TAG, "[$level] $message")

        // Il file viene riscritto dalla lista gia' troncata: il tetto vale anche su disco,
        // su device che restano accesi per mesi.
        val next = (_entries.value + Entry(Instant.now(), level, message)).takeLast(MAX_ENTRIES)
        _entries.value = next
        runCatching { file(context).writeText(next.joinToString("\n", transform = ::format)) }
        Unit
    }

    private fun file(context: Context) = File(context.applicationContext.filesDir, FILE_NAME)

    private fun format(entry: Entry) =
        "${entry.at.toEpochMilli()}\t${entry.level.name}\t${entry.message.replace('\n', ' ')}"

    private fun parse(line: String): Entry? {
        val parts = line.split('\t', limit = 3)
        if (parts.size < 3) return null
        val at = parts[0].toLongOrNull() ?: return null
        val level = runCatching { Level.valueOf(parts[1]) }.getOrNull() ?: return null
        return Entry(Instant.ofEpochMilli(at), level, parts[2])
    }
}
