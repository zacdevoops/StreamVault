package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.stream.VideoStream

object DownloadStreamMapper {
  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

  private val downloadHeaders = mapOf(
    "User-Agent" to USER_AGENT,
    "Referer" to "https://www.youtube.com/",
    "Origin" to "https://www.youtube.com",
  )

  fun resolve(videoId: String, format: String): Map<String, Any?>? {
    val targetHeight = when (format) {
      "mp4_360p" -> 360
      "mp4_720p" -> 720
      else -> return null
    }

    NewPipeBootstrap.ensureInitialized()

    val url = "https://www.youtube.com/watch?v=$videoId"
    val extractor = ServiceList.YouTube.getStreamExtractor(url)
    extractor.fetchPage()

    val candidates = extractor.videoStreams.orEmpty()
      .filter { !it.isVideoOnly }
      .filter { isProgressiveMp4(it) }

    val selected = when (format) {
      "mp4_360p" -> selectBestAtOrBelow(candidates, targetHeight)
      "mp4_720p" -> candidates.firstOrNull { streamHeight(it) == targetHeight }
      else -> null
    } ?: return null

    val content = selected.content?.takeIf { it.isNotBlank() } ?: return null
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
    return height
  }

  private fun streamHeightFromResolution(resolution: String?): Int {
    if (resolution.isNullOrBlank()) return 0
    return Regex("(\\d+)p").find(resolution)?.groupValues?.get(1)?.toIntOrNull() ?: 0
  }

  private fun isProgressiveMp4(stream: VideoStream): Boolean {
    val content = stream.content?.takeIf { it.isNotBlank() } ?: return false
    if (content.contains(".m3u8") || content.contains(".mpd")) return false

    val format = stream.format
    val mimeType = format?.mimeType?.lowercase().orEmpty()
    val suffix = format?.suffix?.lowercase()?.removePrefix(".").orEmpty()

    if (mimeType.contains("mpegurl") || mimeType.contains("dash")) return false
    if (suffix == "mp4" || mimeType.contains("mp4")) return true
    return content.contains(".mp4")
  }
}
