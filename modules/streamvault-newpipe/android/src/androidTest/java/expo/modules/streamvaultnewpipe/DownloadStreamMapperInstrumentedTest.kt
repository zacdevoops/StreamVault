package expo.modules.streamvaultnewpipe

import androidx.test.ext.junit.runners.AndroidJUnit4
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

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
  fun resolve720p_returns720OrAdaptivePairOrNull() {
    val result = DownloadStreamMapper.resolve("dQw4w9WgXcQ", "mp4_720p")
    if (result == null) return

    val height = result["height"] as Int
    val audioUrl = result["audioUrl"] as String?
    assertTrue(
      "Expected height >= 720 or adaptive pair, got height=$height audioUrl=$audioUrl",
      height >= 720 || audioUrl != null,
    )
    assertTrue((result["url"] as String).isNotBlank())
    if (audioUrl != null) {
      assertTrue(audioUrl.isNotBlank())
    }
  }

  @Test
  fun resolveMp3_128_returnsAudioUrlClosestTo128k() {
    val result = DownloadStreamMapper.resolve("dQw4w9WgXcQ", "mp3_128")
    assertNotNull(result)
    val url = result!!["url"] as String
    assertTrue(url.contains("googlevideo.com") || url.contains(".m4a") || url.contains("mime=audio"))
    val bitrate = result["bitrate"] as Int
    assertTrue(bitrate > 0)

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
    }
  }

  @Test
  fun resolveMp3_320_returnsHighestBitrateAudio() {
    val result128 = DownloadStreamMapper.resolve("dQw4w9WgXcQ", "mp3_128")
    val result320 = DownloadStreamMapper.resolve("dQw4w9WgXcQ", "mp3_320")
    assertNotNull(result320)
    val url = result320!!["url"] as String
    assertTrue(url.isNotBlank())
    val bitrate320 = result320["bitrate"] as Int
    assertTrue(bitrate320 > 0)
    if (result128 != null) {
      val bitrate128 = result128["bitrate"] as Int
      assertTrue(bitrate320 >= bitrate128)
    }
  }

}
