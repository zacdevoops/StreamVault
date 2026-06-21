import type { ResolvedDownloadStream } from '@/services/api/apiTypes';
import type { DownloadFormat, VideoDetail, VideoStream } from '@/types';

const FORMAT_HEIGHT: Partial<Record<DownloadFormat, number>> = {
  mp4_360p: 360,
  mp4_720p: 720,
  mp4_1080p: 1080,
  mp4_4k: 2160,
};

function isAudioFormat(format: DownloadFormat): boolean {
  return format === 'mp3_128' || format === 'mp3_320' || format === 'flac';
}

function streamHeight(stream: VideoStream): number {
  const label = stream.qualityLabel ?? stream.quality ?? stream.type ?? '';
  const fromPixels = Number(label.match(/(\d+)p/i)?.[1] ?? 0);
  if (fromPixels > 0) return fromPixels;
  const fromHd = Number(label.match(/hd(\d+)/i)?.[1] ?? 0);
  return fromHd > 0 ? fromHd : 0;
}

function streamBitrate(stream: VideoStream): number {
  return stream.bitrate || Number(stream.size) || 0;
}

function isLikelyAudioStream(stream: VideoStream): boolean {
  if (!stream.url) return false;
  const descriptor = [
    stream.type,
    stream.container,
    stream.encoding,
    stream.quality,
    stream.qualityLabel,
  ]
    .join(' ')
    .toLowerCase();
  if (descriptor.includes('audio/')) return true;
  const hasVideoCodec = /(avc|h264|h265|hevc|vp8|vp9|av01)/i.test(stream.encoding);
  const hasAudioHint = /(audio|m4a|mp3|aac|opus|vorbis|weba)/i.test(descriptor);
  return hasAudioHint && !hasVideoCodec && streamHeight(stream) === 0;
}

function isProgressiveMuxedStream(stream: VideoStream): boolean {
  if (!stream.url || isLikelyAudioStream(stream)) return false;
  const url = stream.url.toLowerCase();
  if (url.includes('.m3u8') || url.includes('.mpd')) return false;
  const descriptor = [stream.type, stream.container, stream.encoding].join(' ').toLowerCase();
  if (descriptor.includes('mpegurl') || descriptor.includes('dash')) return false;
  return streamHeight(stream) > 0;
}

function isDirectDownloadableVideoStream(stream: VideoStream): boolean {
  if (!stream.url || isLikelyAudioStream(stream)) return false;
  const url = stream.url.toLowerCase();
  if (url.includes('.m3u8') || url.includes('.mpd')) return false;
  const descriptor = [stream.type, stream.container, stream.encoding, stream.quality, stream.qualityLabel]
    .join(' ')
    .toLowerCase();
  if (descriptor.includes('mpegurl') || descriptor.includes('dash')) return false;
  if (descriptor.includes('audio/')) return false;
  return streamHeight(stream) > 0;
}

export function pickDownloadStream(
  video: VideoDetail,
  format: DownloadFormat,
): ResolvedDownloadStream | null {
  if (isAudioFormat(format)) {
    const targetBitrate = format === 'mp3_128' ? 128_000 : 320_000;
    const audioStreams = video.adaptiveFormats
      .filter((stream) => stream.url && isLikelyAudioStream(stream))
      .sort((a, b) => {
        const aScore = Math.abs(streamBitrate(a) - targetBitrate);
        const bScore = Math.abs(streamBitrate(b) - targetBitrate);
        return aScore - bScore;
      });
    const selected = audioStreams[0];
    if (!selected) return null;
    return {
      url: selected.url,
      headers: selected.headers,
      container: selected.container,
      ext: selected.container,
      quality: format,
      bitrate: streamBitrate(selected),
    };
  }

  const targetHeight = FORMAT_HEIGHT[format] ?? 720;
  const muxedStreams = video.formatStreams.filter((stream) => isProgressiveMuxedStream(stream));

  if (format === 'mp4_720p') {
    const exactMuxed = muxedStreams.find((stream) => streamHeight(stream) === targetHeight);
    if (exactMuxed) {
      return {
        url: exactMuxed.url,
        headers: exactMuxed.headers,
        container: exactMuxed.container,
        ext: exactMuxed.container,
        quality: format,
        height: streamHeight(exactMuxed),
      };
    }

    const videoOnlyStreams = video.adaptiveFormats.filter((stream) => isDirectDownloadableVideoStream(stream));
    const selectedVideo =
      videoOnlyStreams.find((stream) => streamHeight(stream) === targetHeight) ??
      videoOnlyStreams
        .filter((stream) => streamHeight(stream) >= targetHeight)
        .sort((a, b) => streamHeight(a) - streamHeight(b))[0];

    if (selectedVideo) {
      const audioStreams = video.adaptiveFormats
        .filter((stream) => stream.url && isLikelyAudioStream(stream))
        .sort((a, b) => streamBitrate(b) - streamBitrate(a));
      const selectedAudio = audioStreams[0];
      if (selectedAudio) {
        return {
          url: selectedVideo.url,
          audioUrl: selectedAudio.url,
          headers: selectedVideo.headers ?? selectedAudio.headers,
          container: 'mp4',
          ext: 'mp4',
          quality: format,
          height: streamHeight(selectedVideo),
        };
      }
    }

    const bestMuxed = muxedStreams
      .filter((stream) => streamHeight(stream) >= targetHeight)
      .sort((a, b) => streamHeight(a) - streamHeight(b))[0];
    if (bestMuxed) {
      return {
        url: bestMuxed.url,
        headers: bestMuxed.headers,
        container: bestMuxed.container,
        ext: bestMuxed.container,
        quality: format,
        height: streamHeight(bestMuxed),
      };
    }
    return null;
  }

  const muxedCandidates = muxedStreams.filter((stream) => {
    const height = streamHeight(stream);
    return height > 0 && height <= targetHeight;
  });
  const selectedMuxed = muxedCandidates.sort((a, b) => streamHeight(b) - streamHeight(a))[0];
  if (!selectedMuxed) return null;

  return {
    url: selectedMuxed.url,
    headers: selectedMuxed.headers,
    container: selectedMuxed.container,
    ext: selectedMuxed.container,
    quality: format,
    height: streamHeight(selectedMuxed),
  };
}

export function isDownloadStreamAcceptable(format: DownloadFormat, stream: ResolvedDownloadStream): boolean {
  if (format !== 'mp4_720p') return true;
  if (stream.audioUrl) return true;
  return (stream.height ?? 0) >= 720;
}
