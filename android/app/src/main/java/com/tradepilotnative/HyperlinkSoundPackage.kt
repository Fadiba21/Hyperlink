package com.tradepilotnative

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.SoundPool
import android.os.Process
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.ViewManager
import java.util.Collections
import java.util.Random
import java.util.concurrent.Executors

class HyperlinkSoundModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val readySamples = mutableSetOf<Int>()
  private val sampleIds = mutableMapOf<String, Int>()
  private val instrumentExecutor = Executors.newFixedThreadPool(4)
  private val activeTracks = Collections.synchronizedSet(mutableSetOf<AudioTrack>())
  private val soundPool = SoundPool.Builder()
    .setMaxStreams(4)
    .setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
    )
    .build()

  init {
    soundPool.setOnLoadCompleteListener { _, sampleId, status -> if (status == 0) readySamples.add(sampleId) }
    SAMPLE_NAMES.forEach { name ->
      val resourceId = context.resources.getIdentifier(name, "raw", context.packageName)
      if (resourceId != 0) sampleIds[name] = soundPool.load(context, resourceId, 1)
    }
  }

  override fun getName(): String = "HyperlinkSounds"

  @ReactMethod
  fun play(effect: String, template: String, volume: Double) {
    val level = volume.toFloat().coerceIn(0f, 1f)
    if (template in INSTRUMENT_TEMPLATES) {
      playInstrument(effect, template, level)
      return
    }
    val sampleName = resolve(effect, template)
    val sampleId = sampleIds[sampleName] ?: return
    if (!readySamples.contains(sampleId)) return
    soundPool.play(sampleId, level, level, 1, 0, 1f)
  }

  private fun playInstrument(effect: String, template: String, level: Float) {
    try {
      instrumentExecutor.execute {
        try {
          Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
          val pcm = InstrumentSynth.render(template, effect)
          val track = AudioTrack.Builder()
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            )
            .setAudioFormat(
              AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(InstrumentSynth.SAMPLE_RATE)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build()
            )
            .setBufferSizeInBytes(pcm.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
          activeTracks.add(track)
          try {
            track.setVolume(level)
            track.write(pcm, 0, pcm.size)
            track.play()
            Thread.sleep(pcm.size * 1000L / InstrumentSynth.SAMPLE_RATE)
          } finally {
            activeTracks.remove(track)
            try { track.release() } catch (_: Exception) { }
          }
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
        } catch (_: Exception) {
          // Sound effects are decorative; audio failures must not affect app actions.
        }
      }
    } catch (_: Exception) {
      // The module may be shutting down; omit this decorative sound.
    }
  }

  override fun invalidate() {
    instrumentExecutor.shutdownNow()
    synchronized(activeTracks) {
      activeTracks.forEach { track -> try { track.stop(); track.release() } catch (_: Exception) { } }
      activeTracks.clear()
    }
    soundPool.release()
    readySamples.clear()
    sampleIds.clear()
    super.invalidate()
  }

  private fun resolve(effect: String, template: String): String {
    val set = WHEN_TEMPLATE[template] ?: WHEN_TEMPLATE["soft"]!!
    return set[effect] ?: set["tap"]!!
  }

  companion object {
    private val INSTRUMENT_TEMPLATES = setOf("piano", "harp", "violin", "cello", "acoustic-guitar")
    private val SAMPLE_NAMES = listOf(
      "click_001", "click_003", "select_001", "select_005", "switch_001", "switch_004",
      "toggle_002", "tick_002", "open_001", "glass_001", "glass_002", "pluck_001",
      "confirmation_001", "confirmation_003", "confirmation_004", "error_001", "error_003", "error_005", "bong_001",
      "deep_tap", "deep_select", "deep_toggle", "deep_adjust", "deep_open", "deep_confirm", "deep_error", "deep_notify",
      "deafdeep_notif_popup", "deafdeep_pin_unlock", "deafdeep_anything", "deafdeep_click", "deafdeep_order"
    )

    private val WHEN_TEMPLATE: Map<String, Map<String, String>> = mapOf(
      "soft" to mapOf(
        "tap" to "click_001", "select" to "select_001", "toggle" to "switch_001", "adjust" to "tick_002",
        "open" to "open_001", "confirm" to "confirmation_001", "error" to "error_001", "notify" to "bong_001"
      ),
      "crisp" to mapOf(
        "tap" to "click_003", "select" to "select_005", "toggle" to "switch_004", "adjust" to "tick_002",
        "open" to "glass_001", "confirm" to "confirmation_003", "error" to "error_003", "notify" to "bong_001"
      ),
      "wallet" to mapOf(
        "tap" to "pluck_001", "select" to "glass_002", "toggle" to "switch_004", "adjust" to "tick_002",
        "open" to "glass_001", "confirm" to "confirmation_004", "error" to "error_005", "notify" to "bong_001"
      ),
      "deep" to mapOf(
        "tap" to "deep_tap", "select" to "deep_select", "toggle" to "deep_toggle", "adjust" to "deep_adjust",
        "open" to "deep_open", "confirm" to "deep_confirm", "error" to "deep_error", "notify" to "deep_notify"
      ),
      "deafdeep" to mapOf(
        "tap" to "deafdeep_click", "select" to "deafdeep_anything", "toggle" to "deafdeep_click", "adjust" to "deafdeep_anything",
        "open" to "deafdeep_pin_unlock", "confirm" to "deafdeep_order", "error" to "deafdeep_notif_popup", "notify" to "deafdeep_notif_popup"
      )
    )
  }
}

/** Locally synthesized instrument-like UI notes; no recorded samples are used. */
internal object InstrumentSynth {
  const val SAMPLE_RATE = 22_050
  private val MIDI_NOTES = mapOf(
    "piano" to listOf(60, 62, 64, 67, 69, 72, 74, 76, 79),
    "harp" to listOf(67, 69, 72, 74, 76, 79, 81, 84, 86),
    "violin" to listOf(69, 71, 72, 74, 76, 77, 79, 81, 84),
    "cello" to listOf(48, 50, 52, 55, 57, 60, 62, 64, 67),
    "acoustic-guitar" to listOf(55, 57, 59, 60, 62, 64, 67, 69, 71)
  )

  /** Pass a seeded Random in tests; ordinary playback gets a fresh randomized note. */
  fun render(template: String, effect: String, random: Random = Random()): ShortArray {
    val notes = MIDI_NOTES[template] ?: MIDI_NOTES.getValue("piano")
    val midi = notes[random.nextInt(notes.size)]
    val fundamental = 440.0 * Math.pow(2.0, (midi - 69) / 12.0)
    val duration = when (effect) {
      "tap", "adjust" -> 0.16
      "select", "toggle", "error" -> 0.25
      "open" -> 0.31
      "confirm" -> 0.40
      "notify" -> 0.46
      else -> 0.22
    }
    val count = (SAMPLE_RATE * duration).toInt()
    val rendered = DoubleArray(count)
    var peak = 0.0
    for (index in 0 until count) {
      val time = index.toDouble() / SAMPLE_RATE
      val progress = time / duration
      val value = when (template) {
        "harp" -> harp(fundamental, time)
        "violin" -> bowed(fundamental, time, progress, cello = false)
        "cello" -> bowed(fundamental, time, progress, cello = true)
        "acoustic-guitar" -> guitar(fundamental, time)
        else -> piano(fundamental, time)
      }
      rendered[index] = value
      peak = maxOf(peak, kotlin.math.abs(value))
    }
    val gain = if (peak > 0.0) 0.82 / peak else 0.0
    return ShortArray(count) { index -> (rendered[index] * gain * Short.MAX_VALUE).toInt().toShort() }
  }

  private fun piano(frequency: Double, time: Double): Double {
    val attack = minOf(1.0, time / 0.004)
    return attack * (
      0.72 * Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 5.4) +
      0.30 * Math.sin(2 * Math.PI * frequency * 2.01 * time) * Math.exp(-time * 8.0) +
      0.15 * Math.sin(2 * Math.PI * frequency * 3.98 * time) * Math.exp(-time * 12.0) +
      0.06 * Math.sin(2 * Math.PI * frequency * 6.1 * time) * Math.exp(-time * 17.0)
    )
  }

  private fun harp(frequency: Double, time: Double): Double {
    val pluck = minOf(1.0, time / 0.0015)
    return pluck * (
      0.78 * Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 6.7) +
      0.40 * Math.sin(2 * Math.PI * frequency * 2.76 * time) * Math.exp(-time * 10.5) +
      0.21 * Math.sin(2 * Math.PI * frequency * 5.4 * time) * Math.exp(-time * 15.0) +
      0.10 * Math.sin(2 * Math.PI * frequency * 8.3 * time) * Math.exp(-time * 20.0)
    )
  }

  private fun guitar(frequency: Double, time: Double): Double {
    val pluck = minOf(1.0, time / 0.003)
    val body = 0.78 + 0.22 * Math.sin(2 * Math.PI * frequency * 0.52 * time)
    return pluck * body * (
      0.86 * Math.sin(2 * Math.PI * frequency * time) * Math.exp(-time * 4.4) +
      0.34 * Math.sin(2 * Math.PI * frequency * 2.03 * time) * Math.exp(-time * 7.0) +
      0.14 * Math.sin(2 * Math.PI * frequency * 3.97 * time) * Math.exp(-time * 11.0) +
      0.05 * Math.sin(2 * Math.PI * frequency * 6.02 * time) * Math.exp(-time * 15.0)
    )
  }

  private fun bowed(frequency: Double, time: Double, progress: Double, cello: Boolean): Double {
    val attackTime = if (cello) 0.085 else 0.052
    val attack = minOf(1.0, time / attackTime)
    val releaseStart = 0.72
    val release = if (progress <= releaseStart) 1.0 else Math.exp(-(progress - releaseStart) * 8.0)
    val vibratoDepth = if (cello) 0.0022 else 0.0035
    val bentTime = time + vibratoDepth * Math.sin(2 * Math.PI * (if (cello) 4.4 else 5.3) * time) / (2 * Math.PI)
    val brightness = if (cello) 0.74 else 0.64
    var tone = 0.0
    for (harmonic in 1..8) {
      val weight = 1.0 / Math.pow(harmonic.toDouble(), if (cello) 1.42 else 1.25)
      val partialDecay = Math.exp(-time * (if (cello) 0.85 else 0.70) * harmonic)
      tone += weight * partialDecay * Math.sin(2 * Math.PI * frequency * harmonic * bentTime)
    }
    val bowNoise = 0.025 * Math.sin(2 * Math.PI * frequency * 13.7 * time) * Math.exp(-time * 2.0)
    return attack * release * (brightness * tone + bowNoise)
  }
}

class HyperlinkSoundPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> = listOf(HyperlinkSoundModule(reactContext))
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
