package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.NewPipe

object NewPipeBootstrap {
  @Volatile
  private var initialized = false

  fun ensureInitialized() {
    if (initialized) return
    synchronized(this) {
      if (initialized) return
      NewPipe.init(OkHttpDownloader.instance)
      initialized = true
    }
  }
}
