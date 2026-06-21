package expo.modules.streamvaultnewpipe

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamExtractor
import org.schabi.newpipe.extractor.stream.VideoStream

object DownloadStreamMapper {
  private const val TAG = "DownloadStreamMapper"

  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

  private const val TARGET_MP3_128_BPS = 128_000

  private val downloadHeaders = mapOf(
    "User-Agent" to USER_AGENT,
    "Referer" to "https://www.youtube.com/",
    "Origin" to "https://www.youtube.com",
  )

  private val probeClient = OkHttpClient()

  fun resolve(videoId: String, format: String): Map<String, Any?>? {
    return when (format) {
      "mp4_360p", "mp4_720p" -> resolveVideo(videoId, format)
      "mp3_128", "mp3_320" -> resolveAudio(videoId, format)
      else -> null
    }
  }

  private fun resolveVideo(videoId: String, format: String): Map<String, Any?>? {
    val targetHeight = when (format) {
      "mp4_360p" -> 360
      "mp4_720p" -> 720
      else -> return null
    }

    val extractor = fetchExtractorWithIos(videoId) ?: return null
    val muxedCandidates = extractor.videoStreams.orEmpty()
      .filter { !it.isVideoOnly }
      .filter { isProgressiveMp4(it) }

    val selectedMuxedExact = when (format) {
      "mp4_720p" -> muxedCandidates.firstOrNull { streamHeight(it) == targetHeight }
      "mp4_360p" -> selectBestAtOrBelow(muxedCandidates, targetHeight)
      else -> null
    }

    if (selectedMuxedExact != null) {
      return mapVideoResult(selectedMuxedExact, format)
    }

    if (format == "mp4_720p") {
      resolveVideoOnlyPair(extractor, targetHeight, format)?.let { return it }
      return null
    }

    return null
  }

  private fun resolveVideoOnlyPair(
    extractor: StreamExtractor,
    targetHeight: Int,
    format: String,
  ): Map<String, Any?>? {
    val videoOnlyCandidates = (
      extractor.videoOnlyStreams.orEmpty() +
        extractor.videoStreams.orEmpty().filter { it.isVideoOnly }
      )
      .distinctBy { streamContent(it) ?: "" }
      .filter { isDirectDownloadableVideo(it) }

    val selectedVideo = videoOnlyCandidates.firstOrNull { streamHeight(it) == targetHeight }
      ?: return null

    val audioCandidates = extractor.audioStreams.orEmpty().filter { isDownloadableAudio(it) }
    val selectedAudio = audioCandidates.maxByOrNull { streamBitrate(it) }
      ?: return null

    val videoContent = streamContent(selectedVideo) ?: return null
    val audioContent = streamContent(selectedAudio) ?: return null
    val height = streamHeight(selectedVideo)

    return mapOf(
      "url" to videoContent,
      "audioUrl" to audioContent,
      "ext" to "mp4",
      "container" to "mp4",
      "quality" to format,
      "height" to height,
      "headers" to downloadHeaders,
    )
  }

  private fun mapVideoResult(selected: VideoStream, format: String): Map<String, Any?>? {
    val content = streamContent(selected) ?: return null
    val height = streamHeight(selected)

    return mapOf(
      "url" to content,
      "ext" to "mp4",
      "container" to "mp4",
      "quality" to format,
      "height" to height,
      "headers" to downloadHeaders,
    )
  }

  private fun resolveAudio(videoId: String, format: String): Map<String, Any?>? {
    val extractor = fetchExtractorForAndroid(videoId) ?: return null
    val audioCandidates = getPlayableDownloadAudioStreams(extractor.audioStreams.orEmpty())
    if (audioCandidates.isNotEmpty()) {
      mapSelectedAudio(format, audioCandidates)?.let { return it }
    }

    Log.i(TAG, "Falling back to muxed progressive audio for format=$format videoId=$videoId")
    return resolveAudioFromMuxed(extractor, format)
  }

  private fun mapSelectedAudio(format: String, candidates: List<AudioStream>): Map<String, Any?>? {
    val ordered = when (format) {
      "mp3_128" -> candidates.sortedBy {
        kotlin.math.abs(streamBitrate(it) - TARGET_MP3_128_BPS)
      }
      "mp3_320" -> candidates.sortedByDescending { streamBitrate(it) }
      else -> return null
    }

    for (selected in ordered) {
      mapSelectedAudioStream(format, selected)?.let { return it }
    }
    return null
  }

  private fun mapSelectedAudioStream(format: String, selected: AudioStream): Map<String, Any?>? {
    val content = streamContent(selected) ?: return null
    val deliveryMethod = selected.deliveryMethod
    val host = urlHost(content)
    val itag = selected.itag

    Log.i(
      TAG,
      "Selected audio itag=$itag deliveryMethod=$deliveryMethod host=$host format=$format",
    )

    val responseCode = probeDownloadUrl(content)
    if (responseCode !in 200..299) {
      Log.w(
        TAG,
        "Audio download probe failed itag=$itag deliveryMethod=$deliveryMethod host=$host responseCode=$responseCode",
      )
      return null
    }

    val container = containerForStream(
      content,
      selected.format?.mimeType,
      selected.format?.suffix,
    )
    val bitrate = streamBitrate(selected)

    return mapOf(
      "url" to content,
      "ext" to container,
      "container" to container,
      "quality" to format,
      "bitrate" to bitrate,
      "headers" to downloadHeaders,
    )
  }

  private fun resolveAudioFromMuxed(extractor: StreamExtractor, format: String): Map<String, Any?>? {
    val candidates = extractor.videoStreams.orEmpty()
      .filter { !it.isVideoOnly }
      .filter { isProgressiveMp4(it) }
    if (candidates.isEmpty()) return null

    val selected = when (format) {
      "mp3_128" -> selectClosestMuxedBitrate(candidates, TARGET_MP3_128_BPS)
      "mp3_320" -> candidates.maxByOrNull { muxedBitrate(it) }
      else -> null
    } ?: return null

    val content = streamContent(selected) ?: return null
    val host = urlHost(content)
    Log.i(
      TAG,
      "Selected muxed audio fallback itag=${selected.itag} deliveryMethod=${selected.deliveryMethod} host=$host format=$format",
    )

    val responseCode = probeDownloadUrl(content)
    if (responseCode !in 200..299) {
      Log.w(
        TAG,
        "Muxed audio download probe failed itag=${selected.itag} deliveryMethod=${selected.deliveryMethod} host=$host responseCode=$responseCode",
      )
      return null
    }

    val bitrate = muxedBitrate(selected)

    return mapOf(
      "url" to content,
      "ext" to "m4a",
      "container" to "m4a",
      "quality" to format,
      "bitrate" to bitrate,
      "headers" to downloadHeaders,
    )
  }

  /**
   * Mirrors NewPipe [org.schabi.newpipe.util.ListHelper.getPlayableStreams] and
   * [org.schabi.newpipe.util.ListHelper.getFilteredAudioStreams], plus excludes DASH/HLS
   * URLs that cannot be downloaded as a single progressive file.
   */
  private fun getPlayableDownloadAudioStreams(streams: List<AudioStream>): List<AudioStream> {
    return streams.filter { isPlayableDownloadAudio(it) }
  }

  private fun isPlayableDownloadAudio(stream: AudioStream): Boolean {
    if (!stream.isUrl) return false

    val deliveryMethod = stream.deliveryMethod
    if (deliveryMethod == DeliveryMethod.TORRENT) return false
    if (deliveryMethod == DeliveryMethod.DASH) return false
    if (deliveryMethod == DeliveryMethod.HLS) return false

    val content = streamContent(stream) ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false

    val mimeType = stream.format?.mimeType?.lowercase().orEmpty()
    if (mimeType.contains("mpegurl") || mimeType.contains("dash")) return false

    return deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP
  }

  private fun fetchExtractorForAndroid(videoId: String) = runCatching {
    NewPipeBootstrap.ensureInitialized()
    val url = "https://www.youtube.com/watch?v=$videoId"
    ServiceList.YouTube.getStreamExtractor(url).apply { fetchPage() }
  }.getOrNull()

  private fun fetchExtractorWithIos(videoId: String) = runCatching {
    NewPipeBootstrap.withIosClientFetch {
      val url = "https://www.youtube.com/watch?v=$videoId"
      ServiceList.YouTube.getStreamExtractor(url).apply { fetchPage() }
    }
  }.getOrNull()

  private fun probeDownloadUrl(url: String): Int {
    return runCatching {
      val request = Request.Builder()
        .url(url)
        .header("User-Agent", USER_AGENT)
        .header("Referer", "https://www.youtube.com/")
        .header("Origin", "https://www.youtube.com")
        .header("Range", "bytes=0-1")
        .build()
      probeClient.newCall(request).execute().use { it.code }
    }.getOrElse { error ->
      Log.w(TAG, "Audio download probe error host=${urlHost(url)} message=${error.message}")
      -1
    }
  }

  private fun urlHost(url: String): String {
    return runCatching {
      java.net.URI(url).host?.takeIf { it.isNotBlank() }
    }.getOrNull() ?: "unknown"
  }

  private fun selectClosestBitrate(streams: List<AudioStream>, targetBitrate: Int): AudioStream? {
    return streams
      .filter { streamBitrate(it) > 0 }
      .minByOrNull { kotlin.math.abs(streamBitrate(it) - targetBitrate) }
      ?: streams.maxByOrNull { streamBitrate(it) }
  }

  private fun selectClosestMuxedBitrate(streams: List<VideoStream>, targetBitrate: Int): VideoStream? {
    return streams
      .filter { muxedBitrate(it) > 0 }
      .minByOrNull { kotlin.math.abs(muxedBitrate(it) - targetBitrate) }
      ?: streams.minByOrNull { streamHeight(it) }
  }

  private fun streamContent(stream: Stream): String? {
    return stream.content?.takeIf { it.isNotBlank() }
      ?: stream.url?.takeIf { it.isNotBlank() }
  }

  private fun muxedBitrate(stream: VideoStream): Int {
    return stream.bitrate.takeIf { it > 0 } ?: 0
  }

  private fun streamBitrate(stream: AudioStream): Int {
    return stream.averageBitrate.takeIf { it > 0 } ?: 0
  }

  private fun isDownloadableAudio(stream: AudioStream): Boolean {
    val content = streamContent(stream) ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false
    val mimeType = stream.format?.mimeType?.lowercase().orEmpty()
    if (mimeType.contains("mpegurl") || mimeType.contains("dash")) return false
    return true
  }

  private fun isDirectDownloadableVideo(stream: VideoStream): Boolean {
    val content = streamContent(stream) ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false
    if (content.contains("mime=audio")) return false
    return streamHeight(stream) > 0
  }

  private fun selectBestAtOrBelow(streams: List<VideoStream>, maxHeight: Int): VideoStream? {
    return streams
      .mapNotNull { stream ->
        val height = streamHeight(stream)
        if (height <= 0 || height > maxHeight) null else stream to height
      }
      .maxByOrNull { it.second }
      ?.first
  }

  private fun streamHeight(stream: VideoStream): Int {
    val height = stream.height.takeIf { it > 0 }
      ?: streamHeightFromResolution(stream.resolution)
    if (height > 0) return height
    return streamHeightFromResolution(stream.quality)
  }

  private fun streamHeightFromResolution(resolution: String?): Int {
    if (resolution.isNullOrBlank()) return 0
    return Regex("(\\d+)p").find(resolution)?.groupValues?.get(1)?.toIntOrNull() ?: 0
  }

  private fun isProgressiveMp4(stream: VideoStream): Boolean {
    val content = streamContent(stream) ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false

    val format = stream.format
    val mimeType = format?.mimeType?.lowercase().orEmpty()
    val suffix = format?.suffix?.lowercase()?.removePrefix(".").orEmpty()

    if (mimeType.contains("mpegurl") || mimeType.contains("dash")) return false
    if (suffix == "mp4" || mimeType.contains("mp4")) return true
    return content.contains(".mp4")
  }

  private fun containerForStream(url: String, mimeType: String?, suffix: String?): String {
    if (url.contains(".m3u8")) return "hls"
    if (url.contains(".mpd")) return "dash"
    suffix?.takeIf { it.isNotBlank() }?.let { return it.removePrefix(".") }
    mimeType?.substringAfter('/')?.substringBefore(';')?.takeIf { it.isNotBlank() }?.let { return it }
    return "m4a"
  }
}
