package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.ExtractionException
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeSearchQueryHandlerFactory

object SearchMapper {
  private val searchFactory = YoutubeSearchQueryHandlerFactory.getInstance()

  @Throws(ExtractionException::class)
  fun search(query: String, searchType: String, pageNumber: Int): List<Map<String, Any?>> {
    NewPipeBootstrap.ensureInitialized()

    val normalizedQuery = query.trim()
    if (normalizedQuery.isEmpty()) {
      throw ExtractionException("Search query is required.")
    }

    val contentFilter = contentFilterForType(searchType) ?: return emptyList()
    val searchQuery = if (searchType == "music") "$normalizedQuery music" else normalizedQuery
    val handler = searchFactory.fromQuery(searchQuery, listOf(contentFilter), "")

    val service = ServiceList.YouTube
    val initialInfo = SearchInfo.getInfo(service, handler)
    if (pageNumber <= 1) {
      return mapItems(initialInfo.relatedItems)
    }

    var nextPage: Page? = initialInfo.nextPage
    var currentPage = 1
    while (currentPage < pageNumber) {
      if (nextPage == null) return emptyList()
      val itemsPage = SearchInfo.getMoreItems(service, handler, nextPage)
      currentPage += 1
      if (currentPage == pageNumber) {
        return mapItems(itemsPage.items)
      }
      nextPage = itemsPage.nextPage
    }

    return emptyList()
  }

  private fun contentFilterForType(searchType: String): String? {
    return when (searchType) {
      "video" -> YoutubeSearchQueryHandlerFactory.VIDEOS
      "music" -> YoutubeSearchQueryHandlerFactory.MUSIC_SONGS
      else -> null
    }
  }

  private fun mapItems(items: List<InfoItem>): List<Map<String, Any?>> {
    return items.mapNotNull { VideoResultMapper.mapInfoItem(it) }
  }
}
