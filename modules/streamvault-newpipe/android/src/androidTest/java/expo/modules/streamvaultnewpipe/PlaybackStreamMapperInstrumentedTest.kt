package expo.modules.streamvaultnewpipe

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.schabi.newpipe.extractor.ServiceList

@RunWith(AndroidJUnit4::class)
class PlaybackStreamMapperInstrumentedTest {
  @Test
  fun resolveRickAstley_prefersHlsWhenAvailable() {
    val playback = fetchPlayback("dQw4w9WgXcQ")
    assertNotNull(playback)
    val contentType = playback!!["playbackContentType"] as String
    val url = playback["playbackUrl"] as String
    assertTrue(contentType == "hls" || contentType == "progressive")
    if (contentType == "hls") {
      assertTrue(url.contains(".m3u8") || url.contains("manifest.googlevideo.com"))
    } else {
      assertTrue(url.contains("googlevideo.com") || url.contains(".mp4"))
      assertTrue(!url.contains(".m3u8"))
    }
  }

  @Test
  fun resolveSabRestrictedVideo_prefersHlsWhenAvailable() {
    val playback = fetchPlayback("4BNA6puoQI0")
    if (playback == null) return

    val contentType = playback["playbackContentType"] as String
    val url = playback["playbackUrl"] as String
    assertTrue(
      "Expected HLS, muxed progressive, or DASH — not raw video-only URL",
      contentType == "progressive" || contentType == "hls" || contentType == "dash",
    )
    if (contentType == "progressive") {
      assertTrue(!url.contains("mime=video%2Fmp4") || url.contains("itag=18"))
    }
  }

  private fun fetchPlayback(videoId: String): Map<String, Any?>? {
    NewPipeBootstrap.ensureInitialized()
    val url = "https://www.youtube.com/watch?v=$videoId"
    val extractor = ServiceList.YouTube.getStreamExtractor(url)
    extractor.fetchPage()
    return PlaybackStreamMapper.resolve(extractor)
  }
}
