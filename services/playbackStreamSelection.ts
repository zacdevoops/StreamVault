import type { VideoDetail, VideoStream } from '@/types';
import { mergeYoutubePlaybackHeaders } from '@/services/youtubePlaybackHeaders';

export type PlaybackContentType = 'progressive' | 'hls' | 'dash';

export type ResolvedPlaybackStream = {
  url: string;
  contentType: PlaybackContentType;
  headers?: Record<string, string>;
  stream: VideoStream | null;
};

function streamHeight(stream: VideoStream): number {
  const label = stream.qualityLabel || stream.quality || '';
  const match = label.match(/(\d+)p/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function streamBitrate(stream: VideoStream): number {
  return stream.bitrate ?? 0;
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
  const hasVideoCodec = /(avc|h264|h265|hevc|vp8|vp9|av01)/i.test(stream.encoding);
  const hasAudioHint = /(audio|m4a|mp3|aac|opus|vorbis|weba)/i.test(descriptor);
  return hasAudioHint && !hasVideoCodec && streamHeight(stream) === 0;
}

function isProgressiveMuxedPlaybackStream(stream: VideoStream): boolean {
  if (!stream.url || stream.isVideoOnly || isLikelyAudioStream(stream)) return false;
  const url = stream.url.toLowerCase();
  if (url.includes('.m3u8') || url.includes('.mpd')) return false;
  const descriptor = [stream.type, stream.container, stream.encoding].join(' ').toLowerCase();
  if (descriptor.includes('mpegurl') || descriptor.includes('dash')) return false;
  if (/^video$/i.test(stream.encoding.trim())) return false;
  return streamHeight(stream) > 0;
}

function contentTypeFromUrl(url: string, stream: VideoStream | null): PlaybackContentType {
  const descriptor = [stream?.type, stream?.container, stream?.encoding, stream?.quality]
    .join(' ')
    .toLowerCase();
  if (url.includes('.m3u8') || descriptor.includes('hls') || descriptor.includes('mpegurl')) return 'hls';
  if (url.includes('.mpd') || descriptor.includes('dash')) return 'dash';
  return 'progressive';
}

function selectLegacyPlaybackStream(video: VideoDetail): VideoStream | null {
  const muxedCandidates = video.formatStreams.filter((stream) => isProgressiveMuxedPlaybackStream(stream));
  if (muxedCandidates.length > 0) {
    return muxedCandidates.sort((a, b) => {
      const aHeight = streamHeight(a);
      const bHeight = streamHeight(b);
      if (aHeight !== bHeight) return bHeight - aHeight;
      return streamBitrate(b) - streamBitrate(a);
    })[0];
  }
  return null;
}

export function resolvePlaybackFromDetail(video: VideoDetail): ResolvedPlaybackStream | null {
  if (video.playbackUrl) {
    const contentType = video.playbackContentType ?? contentTypeFromUrl(video.playbackUrl, null);
    return {
      url: video.playbackUrl,
      contentType,
      headers: mergeYoutubePlaybackHeaders(video.playbackUrl, video.playbackHeaders),
      stream: null,
    };
  }

  const muxedStream = selectLegacyPlaybackStream(video);
  if (muxedStream?.url) {
    return {
      url: muxedStream.url,
      contentType: 'progressive',
      headers: mergeYoutubePlaybackHeaders(muxedStream.url, muxedStream.headers),
      stream: muxedStream,
    };
  }

  if (video.hlsUrl) {
    return {
      url: video.hlsUrl,
      contentType: 'hls',
      headers: mergeYoutubePlaybackHeaders(video.hlsUrl),
      stream: null,
    };
  }

  if (video.dashUrl) {
    return {
      url: video.dashUrl,
      contentType: 'dash',
      headers: mergeYoutubePlaybackHeaders(video.dashUrl),
      stream: null,
    };
  }

  return null;
}

export function mergePlaybackIntoDetail(base: VideoDetail, playbackSource: VideoDetail): VideoDetail {
  const resolved = resolvePlaybackFromDetail(playbackSource);
  if (!resolved) return base;

  return {
    ...base,
    playbackUrl: resolved.url,
    playbackContentType: resolved.contentType,
    playbackHeaders: resolved.headers,
    hlsUrl: playbackSource.hlsUrl ?? base.hlsUrl,
    dashUrl: playbackSource.dashUrl ?? base.dashUrl,
    formatStreams:
      playbackSource.formatStreams.length > 0 ? playbackSource.formatStreams : base.formatStreams,
    adaptiveFormats:
      playbackSource.adaptiveFormats.length > 0 ? playbackSource.adaptiveFormats : base.adaptiveFormats,
  };
}
