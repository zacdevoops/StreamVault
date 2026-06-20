package expo.modules.streamvaultnewpipe

import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.ExtractionException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.services.youtube.extractors.kiosk.YoutubeTrendingExtractor
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeTrendingGamingVideosLinkHandlerFactory
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeTrendingMusicLinkHandlerFactory
import org.schabi.newpipe.extractor.services.youtube.linkHandler.YoutubeTrendingPodcastsEpisodesLinkHandlerFactory
import org.schabi.newpipe.extractor.stream.StreamInfoItem

object FeedMapper {
  private val fallbackRegion = "US"

  @Throws(ExtractionException::class)
  fun fetch(category: String, region: String, limit: Int): List<Map<String, Any?>> {
    NewPipeBootstrap.ensureInitialized()

    val normalizedLimit = limit.coerceIn(1, 50)
    val normalizedRegion = normalizeRegion(region)

    return when (category) {
      "all" -> fetchAllFeed(normalizedRegion, normalizedLimit)
      "music" -> fetchMusicFeed(normalizedRegion, normalizedLimit)
      "gaming" -> fetchKioskOrSearch(
        YoutubeTrendingGamingVideosLinkHandlerFactory.KIOSK_ID,
        "new gaming videos today $normalizedRegion",
        normalizedRegion,
        normalizedLimit,
      )
      "podcasts" -> fetchKioskOrSearch(
        YoutubeTrendingPodcastsEpisodesLinkHandlerFactory.KIOSK_ID,
        "new podcast episodes today $normalizedRegion",
        normalizedRegion,
        normalizedLimit,
      )
      "news" -> SearchMapper.search("latest news today $normalizedRegion", "video", 1).take(normalizedLimit)
      "sports" -> SearchMapper.search("latest sports highlights today $normalizedRegion", "video", 1).take(normalizedLimit)
      else -> SearchMapper.search("trending videos today $normalizedRegion", "video", 1).take(normalizedLimit)
    }
  }

  private fun fetchAllFeed(region: String, limit: Int): List<Map<String, Any?>> {
    return fetchKioskOrSearch(
      YoutubeTrendingExtractor.KIOSK_ID,
      "trending videos today $region",
      region,
      limit,
    )
  }

  private fun fetchMusicFeed(region: String, limit: Int): List<Map<String, Any?>> {
    return fetchKioskOrSearch(
      YoutubeTrendingMusicLinkHandlerFactory.KIOSK_ID,
      "new music videos today $region",
      region,
      limit,
    )
  }

  private fun fetchKioskOrSearch(
    kioskId: String,
    searchQuery: String,
    region: String,
    limit: Int,
  ): List<Map<String, Any?>> {
    return runCatching { fetchKiosk(kioskId, region, limit) }
      .getOrNull()
      ?.takeIf { it.isNotEmpty() }
      ?: SearchMapper.search(searchQuery, "video", 1).take(limit)
  }

  private fun normalizeRegion(region: String): String {
    val candidate = region.trim().uppercase()
    if (candidate.length != 2 || candidate == "EN") return fallbackRegion
    return candidate
  }

  @Throws(ExtractionException::class)
  private fun fetchKiosk(kioskId: String, region: String, limit: Int): List<Map<String, Any?>> {
    val kioskList = ServiceList.YouTube.kioskList
    kioskList.forceContentCountry(ContentCountry(region))

    val extractor = kioskList.getExtractorById(kioskId, null)
    extractor.fetchPage()

    val collected = mutableListOf<StreamInfoItem>()
    var page = extractor.initialPage

    while (true) {
      collected.addAll(page.items.filterIsInstance<StreamInfoItem>())
      if (collected.size >= limit || !page.hasNextPage()) break
      page = extractor.getPage(page.nextPage)
    }

    return collected
      .take(limit)
      .mapNotNull { VideoResultMapper.mapStreamInfoItem(it) }
  }
}
