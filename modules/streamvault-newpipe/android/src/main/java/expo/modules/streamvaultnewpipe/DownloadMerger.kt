package expo.modules.streamvaultnewpipe

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import java.nio.ByteBuffer

object DownloadMerger {
  fun merge(videoPath: String, audioPath: String, outputPath: String) {
    val videoExtractor = MediaExtractor()
    val audioExtractor = MediaExtractor()
    var muxer: MediaMuxer? = null

    try {
      videoExtractor.setDataSource(videoPath)
      audioExtractor.setDataSource(audioPath)

      val videoTrackIndex = selectTrack(videoExtractor, "video/")
        ?: throw IllegalArgumentException("No video track found in $videoPath")
      val audioTrackIndex = selectTrack(audioExtractor, "audio/")
        ?: throw IllegalArgumentException("No audio track found in $audioPath")

      videoExtractor.selectTrack(videoTrackIndex)
      audioExtractor.selectTrack(audioTrackIndex)

      val videoFormat = videoExtractor.getTrackFormat(videoTrackIndex)
      val audioFormat = audioExtractor.getTrackFormat(audioTrackIndex)

      muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val muxVideoTrack = muxer.addTrack(videoFormat)
      val muxAudioTrack = muxer.addTrack(audioFormat)
      muxer.start()

      copySamples(videoExtractor, muxer, muxVideoTrack)
      copySamples(audioExtractor, muxer, muxAudioTrack)
    } finally {
      runCatching { muxer?.stop() }
      runCatching { muxer?.release() }
      runCatching { videoExtractor.release() }
      runCatching { audioExtractor.release() }
    }
  }

  private fun selectTrack(extractor: MediaExtractor, mimePrefix: String): Int? {
    for (index in 0 until extractor.trackCount) {
      val mime = extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(mimePrefix)) return index
    }
    return null
  }

  private fun copySamples(extractor: MediaExtractor, muxer: MediaMuxer, muxTrackIndex: Int) {
    val bufferSize = 512 * 1024
    val buffer = ByteBuffer.allocate(bufferSize)
    val info = MediaCodec.BufferInfo()

    while (true) {
      info.offset = 0
      info.size = extractor.readSampleData(buffer, 0)
      if (info.size < 0) break

      info.presentationTimeUs = extractor.sampleTime
      info.flags = extractor.sampleFlags
      muxer.writeSampleData(muxTrackIndex, buffer, info)
      extractor.advance()
    }
  }
}
