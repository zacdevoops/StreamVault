package expo.modules.streamvaultnewpipe

import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StreamVaultNewPipeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StreamVaultNewPipe")

    OnCreate {
      Log.i(TAG, "StreamVaultNewPipe module registered")
      NewPipeBootstrap.ensureInitialized()
    }

    AsyncFunction("ping") {
      return@AsyncFunction "ok"
    }

    AsyncFunction("getVideoDetail") { videoId: String ->
      val normalizedId = videoId.trim()
      if (normalizedId.isEmpty()) {
        throw CodedException("INVALID_VIDEO_ID", "Video id is required.", null)
      }

      try {
        return@AsyncFunction VideoDetailMapper.fetch(normalizedId)
      } catch (error: Exception) {
        Log.w(TAG, "getVideoDetail failed for $normalizedId", error)
        throw CodedException("NEWPIPE_EXTRACTION_FAILED", error.message ?: "Extraction failed.", error)
      }
    }

    AsyncFunction("searchVideos") { query: String, searchType: String, page: Int ->
      try {
        return@AsyncFunction SearchMapper.search(query, searchType, page.coerceAtLeast(1))
      } catch (error: Exception) {
        Log.w(TAG, "searchVideos failed for query=$query type=$searchType page=$page", error)
        throw CodedException("NEWPIPE_SEARCH_FAILED", error.message ?: "Search failed.", error)
      }
    }

    AsyncFunction("getFeed") { category: String, region: String, limit: Int ->
      try {
        return@AsyncFunction FeedMapper.fetch(category, region, limit.coerceIn(1, 50))
      } catch (error: Exception) {
        Log.w(TAG, "getFeed failed for category=$category region=$region limit=$limit", error)
        throw CodedException("NEWPIPE_FEED_FAILED", error.message ?: "Feed failed.", error)
      }
    }
  }

  companion object {
    private const val TAG = "StreamVaultNewPipe"
  }
}
