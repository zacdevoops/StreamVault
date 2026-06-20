package expo.modules.streamvaultnewpipe

import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import java.util.concurrent.TimeUnit

class OkHttpDownloader private constructor() : Downloader() {
  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .writeTimeout(30, TimeUnit.SECONDS)
    .build()

  override fun execute(request: Request): Response {
    val bodyBytes = request.dataToSend()
    val body = bodyBytes?.takeIf { it.isNotEmpty() }?.toRequestBody(
      "application/octet-stream".toMediaTypeOrNull()
    )

    val httpRequest = okhttp3.Request.Builder()
      .url(request.url())
      .method(request.httpMethod(), body)
      .apply {
        request.headers().forEach { (key, values) ->
          values.forEach { value -> addHeader(key, value) }
        }
      }
      .build()

    client.newCall(httpRequest).execute().use { httpResponse ->
      val responseBody = httpResponse.body?.string().orEmpty()
      val responseHeaders = httpResponse.headers.toMultimap().mapValues { it.value.toList() }
      return Response(
        httpResponse.code,
        httpResponse.message,
        responseHeaders,
        responseBody,
        httpResponse.request.url.toString()
      )
    }
  }

  companion object {
    val instance: OkHttpDownloader by lazy { OkHttpDownloader() }
  }
}
