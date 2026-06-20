package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.ExtractionException
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamType
import org.schabi.newpipe.extractor.stream.VideoStream

object VideoDetailMapper {
  private const val USER_AGENT =
    "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

  private val playbackHeaders = mapOf(
    "User-Agent" to USER_AGENT,
    "Referer" to "https://www.youtube.com/",
    "Origin" to "https://www.youtube.com",
  )

  @Throws(ExtractionException::class)
  fun fetch(videoId: String): Map<String, Any?> {
    NewPipeBootstrap.ensureInitialized()

    val url = "https://www.youtube.com/watch?v=$videoId"
    val extractor = ServiceList.YouTube.getStreamExtractor(url)
    extractor.fetchPage()

    val videoStreams = extractor.videoStreams.orEmpty()
    val videoOnlyStreams = extractor.videoOnlyStreams.orEmpty()
    val audioStreams = extractor.audioStreams.orEmpty()

    val mappedVideoStreams = videoStreams.mapNotNull { mapVideoStream(it) }
    val mappedVideoOnlyStreams = videoOnlyStreams.mapNotNull { mapVideoStream(it) }
    val mappedAudioStreams = audioStreams.mapNotNull { mapAudioStream(it) }

    val adaptiveFormats = mappedVideoOnlyStreams + mappedAudioStreams + mappedVideoStreams
    val formatStreams = if (mappedVideoStreams.isNotEmpty()) mappedVideoStreams else adaptiveFormats

    val hlsUrl = extractor.hlsUrl?.takeIf { it.isNotBlank() }
    val dashUrl = extractor.dashMpdUrl?.takeIf { it.isNotBlank() }

    if (formatStreams.isEmpty() && hlsUrl == null && dashUrl == null) {
      throw ExtractionException("No playable streams found for $videoId")
    }

    val uploadDate = runCatching { extractor.textualUploadDate }
      .getOrNull()
      ?.takeIf { it.isNotBlank() }
      ?: "Recently"
    val uploaderUrl = runCatching { extractor.uploaderUrl }.getOrDefault("")
    val authorId = channelIdFromUrl(uploaderUrl)
    val description = runCatching { extractor.description?.content }.getOrDefault("") ?: ""
    val uploaderAvatar = runCatching {
      extractor.uploaderAvatars.firstOrNull()?.url
    }.getOrNull()
    val subscriberCount = runCatching { extractor.uploaderSubscriberCount }.getOrDefault(0L)
    val streamType = runCatching { extractor.streamType }.getOrNull()

    return mapOf(
      "videoId" to videoId,
      "title" to (extractor.name ?: "Video"),
      "author" to (runCatching { extractor.uploaderName }.getOrDefault("Unknown") ?: "Unknown"),
      "authorId" to authorId,
      "authorUrl" to uploaderUrl,
      "videoThumbnails" to mapThumbnails(extractor.thumbnails, videoId),
      "description" to description,
      "published" to 0,
      "publishedText" to uploadDate,
      "viewCount" to runCatching { extractor.viewCount }.getOrDefault(0L),
      "likeCount" to runCatching { extractor.likeCount }.getOrDefault(-1L).takeIf { it >= 0 },
      "lengthSeconds" to runCatching { extractor.length }.getOrDefault(0L),
      "paid" to false,
      "premium" to false,
      "liveNow" to (streamType == StreamType.LIVE_STREAM),
      "isUpcoming" to (streamType == StreamType.POST_LIVE_STREAM),
      "adaptiveFormats" to adaptiveFormats,
      "formatStreams" to formatStreams,
      "hlsUrl" to hlsUrl,
      "dashUrl" to dashUrl,
      "recommendedVideos" to emptyList<Map<String, Any?>>(),
      "authorThumbnails" to mapAuthorThumbnail(uploaderAvatar),
      "subCountText" to formatCount(subscriberCount),
      "allowRatings" to true,
      "rating" to 0,
      "isFamilyFriendly" to true,
      "genre" to (runCatching { extractor.category }.getOrDefault("") ?: ""),
      "keywords" to runCatching { extractor.tags.orEmpty() }.getOrDefault(emptyList()),
    )
  }

  private fun mapVideoStream(stream: VideoStream): Map<String, Any?>? {
    val content = stream.content?.takeIf { it.isNotBlank() } ?: return null
    val height = stream.height.takeIf { it > 0 } ?: streamHeightFromResolution(stream.resolution)
    val format = stream.format
    val container = containerForStream(content, format?.mimeType, format?.suffix)
    val encoding = stream.codec.takeIf { it.isNotBlank() }
      ?: format?.name?.takeIf { it.isNotBlank() }
      ?: if (stream.isVideoOnly) "video" else "avc1"

    return mapOf(
      "url" to content,
      "itag" to stream.itag,
      "type" to (format?.mimeType ?: container),
      "quality" to (stream.resolution ?: stream.quality ?: ""),
      "fps" to stream.fps.takeIf { it > 0 },
      "container" to container,
      "encoding" to encoding,
      "qualityLabel" to (stream.resolution ?: if (height > 0) "${height}p" else stream.quality ?: ""),
      "bitrate" to stream.bitrate,
      "headers" to playbackHeaders,
    )
  }

  private fun mapAudioStream(stream: AudioStream): Map<String, Any?>? {
    val content = stream.content?.takeIf { it.isNotBlank() } ?: return null
    val format = stream.format
    val container = containerForStream(content, format?.mimeType, format?.suffix)

    return mapOf(
      "url" to content,
      "itag" to stream.itag,
      "type" to (format?.mimeType ?: container),
      "quality" to stream.quality,
      "container" to container,
      "encoding" to (stream.codec.takeIf { it.isNotBlank() } ?: format?.name ?: "audio"),
      "qualityLabel" to "${stream.averageBitrate / 1000}k",
      "bitrate" to stream.averageBitrate,
      "headers" to playbackHeaders,
    )
  }

  private fun streamHeightFromResolution(resolution: String?): Int {
    if (resolution.isNullOrBlank()) return 0
    return Regex("(\\d+)p").find(resolution)?.groupValues?.get(1)?.toIntOrNull() ?: 0
  }

  private fun containerForStream(url: String, mimeType: String?, suffix: String?): String {
    if (url.contains(".m3u8")) return "hls"
    if (url.contains(".mpd")) return "dash"
    suffix?.takeIf { it.isNotBlank() }?.let { return it.removePrefix(".") }
    mimeType?.substringAfter('/')?.substringBefore(';')?.takeIf { it.isNotBlank() }?.let { return it }
    return "mp4"
  }

  private fun mapThumbnails(thumbnails: List<Image>?, videoId: String): List<Map<String, Any?>> {
    val mapped = thumbnails.orEmpty()
      .filter { !it.url.isNullOrBlank() }
      .mapIndexed { index, image ->
        mapOf(
          "quality" to (image.height.takeIf { it > 0 }?.toString() ?: index.toString()),
          "url" to image.url,
          "width" to image.width,
          "height" to image.height,
        )
      }

    if (mapped.isNotEmpty()) return mapped

    return listOf(
      mapOf(
        "quality" to "high",
        "url" to "https://i.ytimg.com/vi/$videoId/hqdefault.jpg",
        "width" to 480,
        "height" to 360,
      )
    )
  }

  private fun mapAuthorThumbnail(avatarUrl: String?): List<Map<String, Any?>> {
    if (avatarUrl.isNullOrBlank()) return emptyList()
    return listOf(
      mapOf(
        "quality" to "default",
        "url" to avatarUrl,
        "width" to 0,
        "height" to 0,
      )
    )
  }

  private fun channelIdFromUrl(uploaderUrl: String): String {
    if (uploaderUrl.isBlank()) return ""
    Regex("/channel/([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    Regex("/@([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    Regex("/user/([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    return ""
  }

  private fun formatCount(count: Long): String {
    if (count <= 0) return ""
    return when {
      count >= 1_000_000_000 -> String.format("%.1fB", count / 1_000_000_000.0)
      count >= 1_000_000 -> String.format("%.1fM", count / 1_000_000.0)
      count >= 1_000 -> String.format("%.1fK", count / 1_000.0)
      else -> count.toString()
    }
  }
}
