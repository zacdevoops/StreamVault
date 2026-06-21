package expo.modules.streamvaultnewpipe

import android.util.Log
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamExtractor
import org.schabi.newpipe.extractor.stream.VideoStream

/**
 * Mirrors NewPipe's [org.schabi.newpipe.util.ListHelper.getPlayableStreams] and
 * [org.schabi.newpipe.player.resolver.VideoPlaybackResolver] stream selection for playback.
 * Never returns raw video-only DASH URLs as progressive sources.
 */
object PlaybackStreamMapper {
  private const val TAG = "PlaybackStreamMapper"

  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

  private val playbackHeaders = mapOf(
    "User-Agent" to USER_AGENT,
    "Referer" to "https://www.youtube.com/",
    "Origin" to "https://www.youtube.com",
  )

  fun resolve(extractor: StreamExtractor): Map<String, Any?>? {
    val hlsUrl = extractor.hlsUrl?.takeIf { it.isNotBlank() }
    if (hlsUrl != null) {
      Log.i(TAG, "Selected playback source type: hls")
      return playbackResult(hlsUrl, "hls")
    }

    val muxedCandidates = extractor.videoStreams.orEmpty()
      .filter { !it.isVideoOnly }
      .filter { isPlayableProgressive(it) }

    val bestMuxed = muxedCandidates.maxByOrNull { streamHeight(it) }
    if (bestMuxed != null) {
      val url = streamContent(bestMuxed) ?: return null
      Log.i(TAG, "Selected playback source type: progressive")
      return playbackResult(url, "progressive")
    }

    val dashUrl = extractor.dashMpdUrl?.takeIf { it.isNotBlank() }
    if (dashUrl != null) {
      Log.i(TAG, "Selected playback source type: dash")
      return playbackResult(dashUrl, "dash")
    }

    Log.w(TAG, "No playable playback source found")
    return null
  }

  private fun playbackResult(url: String, contentType: String): Map<String, Any?> {
    return mapOf(
      "playbackUrl" to url,
      "playbackContentType" to contentType,
      "headers" to playbackHeaders,
    )
  }

  private fun isPlayableProgressive(stream: VideoStream): Boolean {
    if (stream.isVideoOnly) return false
    val content = streamContent(stream) ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false

    val deliveryMethod = stream.deliveryMethod
    if (deliveryMethod == DeliveryMethod.TORRENT || deliveryMethod == DeliveryMethod.HLS) {
      return false
    }

    val format = stream.format
    if (format == MediaFormat.OPUS && deliveryMethod == DeliveryMethod.HLS) {
      return false
    }

    val mimeType = format?.mimeType?.lowercase().orEmpty()
    if (mimeType.contains("mpegurl") || mimeType.contains("dash")) return false
    return streamHeight(stream) > 0
  }

  private fun streamContent(stream: Stream): String? {
    return stream.content?.takeIf { it.isNotBlank() }
      ?: stream.url?.takeIf { it.isNotBlank() }
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
}
