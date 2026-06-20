package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType

object VideoResultMapper {
  fun mapInfoItem(item: InfoItem): Map<String, Any?>? {
    if (item.infoType != InfoItem.InfoType.STREAM) return null
    val streamItem = item as? StreamInfoItem ?: return null
    return mapStreamInfoItem(streamItem)
  }

  fun mapStreamInfoItem(item: StreamInfoItem): Map<String, Any?>? {
    val videoId = videoIdFromUrl(item.url) ?: return null
    val streamType = item.streamType

    return mapOf(
      "videoId" to videoId,
      "title" to (item.name ?: "Video"),
      "author" to (item.uploaderName ?: "Unknown"),
      "authorId" to channelIdFromUrl(item.uploaderUrl.orEmpty()),
      "authorUrl" to item.uploaderUrl.orEmpty(),
      "videoThumbnails" to mapThumbnails(item.thumbnails, videoId),
      "description" to item.shortDescription.orEmpty(),
      "published" to 0,
      "publishedText" to (item.textualUploadDate?.takeIf { it.isNotBlank() } ?: "Recently"),
      "viewCount" to item.viewCount,
      "lengthSeconds" to item.duration,
      "paid" to false,
      "premium" to false,
      "liveNow" to (streamType == StreamType.LIVE_STREAM),
      "isUpcoming" to (streamType == StreamType.POST_LIVE_STREAM),
    )
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

  private fun videoIdFromUrl(url: String?): String? {
    if (url.isNullOrBlank()) return null
    Regex("[?&]v=([^&]+)").find(url)?.groupValues?.get(1)?.let { return it }
    Regex("/shorts/([^/?#]+)").find(url)?.groupValues?.get(1)?.let { return it }
    Regex("/watch/([^/?#]+)").find(url)?.groupValues?.get(1)?.let { return it }
    return null
  }

  private fun channelIdFromUrl(uploaderUrl: String): String {
    if (uploaderUrl.isBlank()) return ""
    Regex("/channel/([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    Regex("/@([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    Regex("/user/([^/?#]+)").find(uploaderUrl)?.groupValues?.get(1)?.let { return it }
    return ""
  }
}
