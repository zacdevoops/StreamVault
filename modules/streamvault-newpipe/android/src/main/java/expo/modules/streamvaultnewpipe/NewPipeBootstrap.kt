package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.services.youtube.extractors.YoutubeStreamExtractor

object NewPipeBootstrap {
  @Volatile
  private var initialized = false
  private val lock = Any()

  fun ensureInitialized() {
    if (initialized) return
    synchronized(lock) {
      if (initialized) return
      // Playback uses Android/VisionOS clients. iOS InnerTube is enabled only for downloads.
      YoutubeStreamExtractor.setFetchIosClient(false)
      NewPipe.init(OkHttpDownloader.instance)
      initialized = true
    }
  }

  fun <T> withIosClientFetch(block: () -> T): T {
    ensureInitialized()
    synchronized(lock) {
      YoutubeStreamExtractor.setFetchIosClient(true)
      try {
        return block()
      } finally {
        YoutubeStreamExtractor.setFetchIosClient(false)
      }
    }
  }
}
