package expo.modules.streamvaultnewpipe

import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.schabi.newpipe.extractor.ServiceList

@RunWith(AndroidJUnit4::class)
class DownloadStreamMapperInstrumentedTest {
  private val client = OkHttpClient()

  @Test
  fun resolve360p_returnsProgressiveMp4Url() {
    val result = DownloadStreamMapper.resolve("dQw4w9WgXcQ", "mp4_360p")
    assertNotNull(result)
    val url = result!!["url"] as String
    assertTrue(url.contains("googlevideo.com") || url.contains(".mp4"))
    val height = result["height"] as Int
    assertTrue(height in 1..360)

    @Suppress("UNCHECKED_CAST")
    val headers = result["headers"] as Map<String, String>
    val request = Request.Builder()
      .url(url)
      .header("User-Agent", headers["User-Agent"]!!)
      .header("Referer", headers["Referer"]!!)
      .header("Origin", headers["Origin"]!!)
      .header("Range", "bytes=0-65535")
      .build()
    client.newCall(request).execute().use { response ->
      assertTrue("Expected HTTP success, got ${response.code}", response.isSuccessful)
      assertTrue((response.body?.contentLength() ?: 0) > 0)
    }
  }

  @Test
  fun resolve720p_returns720WhenProgressiveExists() {
    val videoId = findVideoWithProgressive720p() ?: return
    val result = DownloadStreamMapper.resolve(videoId, "mp4_720p")
    assertNotNull("Expected progressive 720p for $videoId", result)
    assertEquals(720, result!!["height"] as Int)
  }

  private fun findVideoWithProgressive720p(): String? {
    val candidates = listOf(
      "9bZkp7q19f0",
      "jNQXAC9IVRw",
      "M7lc1UVf-VE",
      "dQw4w9WgXcQ",
    )

    NewPipeBootstrap.ensureInitialized()
    for (videoId in candidates) {
      val url = "https://www.youtube.com/watch?v=$videoId"
      val extractor = ServiceList.YouTube.getStreamExtractor(url)
      runCatching { extractor.fetchPage() }.getOrNull() ?: continue
      val has720 = extractor.videoStreams.orEmpty().any { stream ->
        !stream.isVideoOnly && stream.height == 720
      }
      if (has720) return videoId
    }
    return null
  }
}
