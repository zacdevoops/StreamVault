import { create, type AxiosInstance } from 'axios';
import { VideoDetail, VideoResult, VideoStream, VideoThumbnail } from '@/types';
import type { ResolvedDownloadStream } from '../apiTypes';

const INVIDIOUS_INSTANCES = [
  'https://yt.chocolatemoo53.com',
  'https://yewtu.be',
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com',
  'https://yt.cdaut.de',
  'https://invidious.jing.rocks',
  'https://invidious.fdn.fr',
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.adminforge.de',
  'https://api-piped.mha.fi',
];

interface YtdlpThumbnail {
  url?: string;
  width?: number;
  height?: number;
  id?: string;
  resolution?: string;
}

interface YtdlpFormat {
  url?: string;
  format_id?: string;
  ext?: string;
  container?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  fps?: number;
  tbr?: number;
  abr?: number;
  filesize?: number;
  filesize_approx?: number;
  format_note?: string;
  quality?: string;
  http_headers?: Record<string, string>;
}

interface YtdlpInfo {
  id?: string;
  title?: string;
  uploader?: string;
  uploader_id?: string;
  uploader_url?: string;
  channel?: string;
  channel_id?: string;
  webpage_url?: string;
  url?: string;
  description?: string;
  duration?: number;
  timestamp?: number;
  upload_date?: string;
  view_count?: number;
  like_count?: number;
  live_status?: string;
  is_live?: boolean;
  thumbnails?: YtdlpThumbnail[];
  formats?: YtdlpFormat[];
  ext?: string;
  container?: string;
  filesize?: number;
  quality?: string;
  height?: number;
  width?: number;
  bitrate?: number;
  headers?: Record<string, string>;
}

interface PipedStream {
  url?: string;
  format?: string;
  quality?: string;
  mimeType?: string;
  codec?: string;
  videoOnly?: boolean;
  itag?: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
}

interface PipedRelatedStream {
  url?: string;
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  uploaderUrl?: string;
  uploaded?: number;
  uploadedDate?: string;
  duration?: number;
  views?: number;
}

interface PipedDetail {
  title?: string;
  description?: string;
  uploadDate?: string;
  uploader?: string;
  uploaderUrl?: string;
  uploaderAvatar?: string;
  uploaderSubscriberCount?: number;
  thumbnailUrl?: string;
  hls?: string;
  dash?: string;
  duration?: number;
  views?: number;
  likes?: number;
  category?: string;
  tags?: string[];
  videoStreams?: PipedStream[];
  audioStreams?: PipedStream[];
  relatedStreams?: PipedRelatedStream[];
}

declare const process: { env?: Record<string, string | undefined> };
declare const fetch: (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
}>;

let activeInvidiousInstance = INVIDIOUS_INSTANCES[0];
let activePipedInstance = PIPED_INSTANCES[0];
let activeYtdlpApiUrl: string | null = null;
let lastYtdlpHealthCheck = 0;

const client: AxiosInstance = create({ timeout: 15000 });

function firstFulfilled<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let rejected = 0;
    let lastError: unknown;

    promises.forEach((promise) => {
      promise.then(resolve).catch((error) => {
        rejected += 1;
        lastError = error;
        if (rejected === promises.length) {
          reject(lastError ?? new Error('All requests failed'));
        }
      });
    });
  });
}

function getConfiguredYtdlpApiUrl(): string {
  const value = process.env?.EXPO_PUBLIC_YTDLP_API_URL?.trim();
  if (!value) {
    throw new Error(
      'EXPO_PUBLIC_YTDLP_API_URL is not set. Set it to your backend base URL.'
    );
  }
  return value.replace(/\/+$/, '');
}

function withHardTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timed out')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function fetchJson<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
  timeoutMs = 12_000
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Backend responded ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getYtdlpApiUrls(): string[] {
  return [getConfiguredYtdlpApiUrl()];
}

async function getReachableYtdlpApiUrls(): Promise<string[]> {
  const candidates = getYtdlpApiUrls();
  const now = Date.now();
  if (activeYtdlpApiUrl === candidates[0] && now - lastYtdlpHealthCheck < 60_000) {
    return candidates;
  }

  const checks = await Promise.allSettled(
    candidates.map(async (baseUrl) => {
      await withHardTimeout(fetchJson(`${baseUrl}/health`, {}, 1800), 2000);
      return baseUrl;
    })
  );
  const reachable = checks
    .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (reachable.length > 0) {
    activeYtdlpApiUrl = reachable[0];
    lastYtdlpHealthCheck = now;
    return reachable;
  }

  activeYtdlpApiUrl = null;
  lastYtdlpHealthCheck = now;
  return [];
}

function youtubeUrl(videoId: string): string {
  return videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
}

function isResolvedHls(resolved: ResolvedDownloadStream): boolean {
  return (
    [resolved.url, resolved.ext, resolved.container, resolved.quality]
      .join(' ')
      .toLowerCase()
      .includes('hls') || /\.m3u8($|[?#])/.test(resolved.url)
  );
}

function backendStreamUrl(baseUrl: string, videoId: string, resolved: ResolvedDownloadStream): string {
  const id = videoIdFromUrl(youtubeUrl(videoId), videoId);
  const suffix = isResolvedHls(resolved) ? '.m3u8' : '';
  return `${baseUrl}/stream/${encodeURIComponent(id)}${suffix}`;
}

async function tryInvidious<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const instances = [activeInvidiousInstance, ...INVIDIOUS_INSTANCES.filter((i) => i !== activeInvidiousInstance)];
  return firstFulfilled(
    instances.map(async (instance) => {
      const res = await withHardTimeout(
        client.get<T>(`${instance}${path}`, { params, timeout: 5000 }),
        5500
      );
      activeInvidiousInstance = instance;
      return res.data;
    })
  );
}

async function tryPiped<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const instances = [activePipedInstance, ...PIPED_INSTANCES.filter((i) => i !== activePipedInstance)];
  return firstFulfilled(
    instances.map(async (instance) => {
      const res = await withHardTimeout(
        client.get<T>(`${instance}${path}`, { params, timeout: 5000 }),
        5500
      );
      activePipedInstance = instance;
      return res.data;
    })
  );
}

async function tryYtdlpExtract(url: string, flat = false, limit = 20, timeout = 45000): Promise<YtdlpInfo | null> {
  for (const baseUrl of await getReachableYtdlpApiUrls()) {
    try {
      const data = await withHardTimeout(
        fetchJson<YtdlpInfo>(
          `${baseUrl}/extract`,
          { method: 'POST', body: { url, flat, limit } },
          timeout + 1000
        ),
        timeout + 1500
      );
      activeYtdlpApiUrl = baseUrl;
      return data;
    } catch {}
  }
  return null;
}

async function tryYtdlpPlayback(videoId: string): Promise<ResolvedDownloadStream | null> {
  for (const baseUrl of await getReachableYtdlpApiUrls()) {
    const requestBody = { url: youtubeUrl(videoId) };
    try {
      if (__DEV__) {
        console.log('[playback] POST request', `${baseUrl}/playback`, requestBody);
      }

      const data = await withHardTimeout(
        fetchJson<ResolvedDownloadStream>(
          `${baseUrl}/playback`,
          { method: 'POST', body: requestBody },
          60_000
        ),
        61_000
      );
      if (__DEV__) {
        console.log('[playback] POST response', data);
      }
      activeYtdlpApiUrl = baseUrl;
      return {
        ...data,
        url: backendStreamUrl(baseUrl, videoId, data),
        headers: undefined,
      };
    } catch (error) {
      if (__DEV__) {
        console.log('[playback] POST error', error);
      }
    }
  }
  return null;
}

function publishedText(info: YtdlpInfo): string {
  if (typeof info.timestamp === 'number') {
    return new Date(info.timestamp * 1000).toLocaleDateString();
  }
  if (info.upload_date && info.upload_date.length === 8) {
    const year = info.upload_date.slice(0, 4);
    const month = info.upload_date.slice(4, 6);
    const day = info.upload_date.slice(6, 8);
    return `${year}-${month}-${day}`;
  }
  return 'Recently';
}

function mapYtdlpThumbnails(thumbnails?: YtdlpThumbnail[]): VideoThumbnail[] {
  return (thumbnails ?? [])
    .filter((thumb) => !!thumb.url)
    .map((thumb, index) => ({
      quality: thumb.id ?? thumb.resolution ?? String(thumb.height ?? index),
      url: thumb.url!,
      width: thumb.width ?? 0,
      height: thumb.height ?? 0,
    }));
}

function mapYtdlpFormat(format: YtdlpFormat): VideoStream | null {
  if (!format.url) return null;
  const bitrate = format.tbr ?? format.abr ?? 0;
  return {
    url: format.url,
    itag: Number(format.format_id) || 0,
    type: format.ext ?? format.container ?? 'unknown',
    quality: format.format_note ?? format.quality ?? String(format.height ?? ''),
    fps: format.fps,
    container: format.container ?? format.ext ?? '',
    encoding: format.vcodec && format.vcodec !== 'none' ? format.vcodec : format.acodec ?? '',
    qualityLabel: format.height ? `${format.height}p` : format.format_note ?? format.quality ?? '',
    bitrate,
    size: String(format.filesize ?? format.filesize_approx ?? ''),
    headers: format.http_headers,
  };
}

function mapYtdlpResult(info: YtdlpInfo): VideoResult {
  const id = info.id ?? info.url ?? info.webpage_url ?? '';
  return {
    videoId: id,
    title: info.title ?? 'Untitled video',
    author: info.uploader ?? info.channel ?? 'Unknown',
    authorId: info.uploader_id ?? info.channel_id ?? '',
    authorUrl: info.uploader_url ?? '',
    videoThumbnails: mapYtdlpThumbnails(info.thumbnails),
    description: info.description ?? '',
    published: info.timestamp ?? 0,
    publishedText: publishedText(info),
    viewCount: info.view_count ?? 0,
    likeCount: info.like_count,
    lengthSeconds: info.duration ?? 0,
    paid: false,
    premium: false,
    liveNow: info.is_live === true || info.live_status === 'is_live',
    isUpcoming: info.live_status === 'is_upcoming',
  };
}

function streamFromResolved(resolved: ResolvedDownloadStream): VideoStream {
  const descriptor = [resolved.url, resolved.ext, resolved.container, resolved.quality]
    .join(' ')
    .toLowerCase();
  const isHls = /\.m3u8($|[?#])/.test(resolved.url) || descriptor.includes('hls');
  const isDash = /\.mpd($|[?#])/.test(resolved.url) || descriptor.includes('dash');
  const container = isHls ? 'hls' : isDash ? 'dash' : resolved.container ?? resolved.ext ?? 'mp4';
  const type = isHls
    ? 'application/x-mpegURL'
    : isDash
      ? 'application/dash+xml'
      : resolved.ext ?? resolved.container ?? 'mp4';

  return {
    url: resolved.url,
    itag: Number(resolved.quality) || 0,
    type,
    quality: resolved.quality ?? '',
    container,
    encoding: isHls || isDash ? 'stream' : 'h264',
    qualityLabel: resolved.height ? `${resolved.height}p` : resolved.quality ?? '',
    bitrate: resolved.bitrate ?? 0,
    size: String(resolved.filesize ?? ''),
    headers: resolved.headers,
  };
}

function mapYtdlpDetail(info: YtdlpInfo): VideoDetail {
  const result = mapYtdlpResult(info);
  const mappedFormats = (info.formats ?? []).map(mapYtdlpFormat).filter((format): format is VideoStream => !!format);
  const resolvedStream =
    info.url &&
    (info.ext || info.container || info.quality || info.height || info.bitrate || info.headers)
      ? streamFromResolved(info as ResolvedDownloadStream)
      : null;
  const formats = mappedFormats.length > 0 ? mappedFormats : resolvedStream ? [resolvedStream] : [];
  const progressive = formats.filter((format) => !!format.url && !/none/i.test(format.encoding));
  const hlsStream = formats.find((format) => format.container === 'hls');
  const dashStream = formats.find((format) => format.container === 'dash');
  return {
    ...result,
    adaptiveFormats: formats,
    formatStreams: progressive.length > 0 ? progressive : formats,
    hlsUrl: hlsStream?.url,
    dashUrl: dashStream?.url,
    recommendedVideos: [],
    authorThumbnails: [],
    subCountText: '',
    allowRatings: true,
    rating: 0,
    isFamilyFriendly: true,
    genre: '',
    keywords: [],
  };
}

function videoIdFromUrl(url: string | undefined, fallback = ''): string {
  if (!url) return fallback;
  const match = url.match(/[?&]v=([^&]+)/) ?? url.match(/\/watch\/([^/?]+)/);
  return decodeURIComponent(match?.[1] ?? fallback);
}

function fallbackThumb(videoId: string): VideoThumbnail[] {
  return [
    {
      quality: 'high',
      url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
  ];
}

function formatViewCount(count: number | null | undefined): string {
  if (count == null) return '0';
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function mapPipedStream(stream: PipedStream): VideoStream | null {
  if (!stream.url) return null;
  const quality = stream.quality ?? '';
  const height = stream.height ?? Number(quality.match(/(\d+)p/)?.[1] ?? 0);
  return {
    url: stream.url,
    itag: stream.itag ?? 0,
    type: stream.mimeType ?? stream.format ?? 'video/mp4',
    quality,
    fps: stream.fps,
    container: stream.format ?? stream.mimeType?.split('/')[1]?.split(';')[0] ?? 'mp4',
    encoding: stream.codec ?? '',
    qualityLabel: height ? `${height}p` : quality,
    bitrate: stream.bitrate ?? 0,
  };
}

function mapPipedRelated(item: PipedRelatedStream): VideoResult | null {
  const relatedVideoId = videoIdFromUrl(item.url);
  if (!relatedVideoId) return null;
  return {
    videoId: relatedVideoId,
    title: item.title ?? 'Video',
    author: item.uploaderName ?? 'Unknown',
    authorId: videoIdFromUrl(item.uploaderUrl),
    authorUrl: item.uploaderUrl ?? '',
    videoThumbnails: item.thumbnail
      ? [{ quality: 'default', url: item.thumbnail, width: 0, height: 0 }]
      : fallbackThumb(relatedVideoId),
    description: '',
    published: item.uploaded ?? 0,
    publishedText: item.uploadedDate ?? 'Recently',
    viewCount: item.views ?? 0,
    lengthSeconds: item.duration ?? 0,
    paid: false,
    premium: false,
    liveNow: false,
    isUpcoming: false,
  };
}

function mapPipedDetail(videoId: string, detail: PipedDetail): VideoDetail | null {
  const allVideoStreams = (detail.videoStreams ?? [])
    .map(mapPipedStream)
    .filter((stream): stream is VideoStream => !!stream);
  const progressiveStreams = (detail.videoStreams ?? [])
    .filter((stream) => !stream.videoOnly)
    .map(mapPipedStream)
    .filter((stream): stream is VideoStream => !!stream);
  const thumbnails = detail.thumbnailUrl
    ? [{ quality: 'default', url: detail.thumbnailUrl, width: 0, height: 0 }]
    : fallbackThumb(videoId);

  if (!detail.hls && progressiveStreams.length === 0 && allVideoStreams.length === 0) {
    return null;
  }

  return {
    videoId,
    title: detail.title ?? 'Video',
    author: detail.uploader ?? 'Unknown',
    authorId: videoIdFromUrl(detail.uploaderUrl),
    authorUrl: detail.uploaderUrl ?? '',
    videoThumbnails: thumbnails,
    description: detail.description ?? '',
    published: 0,
    publishedText: detail.uploadDate ?? 'Recently',
    viewCount: detail.views ?? 0,
    likeCount: detail.likes,
    lengthSeconds: detail.duration ?? 0,
    paid: false,
    premium: false,
    liveNow: false,
    isUpcoming: false,
    adaptiveFormats: allVideoStreams,
    formatStreams: progressiveStreams.length > 0 ? progressiveStreams : allVideoStreams,
    hlsUrl: detail.hls || undefined,
    dashUrl: detail.dash || undefined,
    recommendedVideos: (detail.relatedStreams ?? [])
      .map(mapPipedRelated)
      .filter((item): item is VideoResult => !!item),
    authorThumbnails: detail.uploaderAvatar
      ? [{ quality: 'default', url: detail.uploaderAvatar, width: 0, height: 0 }]
      : [],
    subCountText: detail.uploaderSubscriberCount ? formatViewCount(detail.uploaderSubscriberCount) : '',
    allowRatings: true,
    rating: 0,
    isFamilyFriendly: true,
    genre: detail.category ?? '',
    keywords: detail.tags ?? [],
  };
}

function resultFromResolved(videoId: string, resolved: ResolvedDownloadStream): VideoResult {
  return {
    videoId,
    title: resolved.title ?? 'Video',
    author: resolved.uploader ?? resolved.channel ?? 'Unknown',
    authorId: resolved.uploader_id ?? resolved.channel_id ?? '',
    authorUrl: resolved.uploader_url ?? '',
    videoThumbnails: mapYtdlpThumbnails(resolved.thumbnails),
    description: resolved.description ?? '',
    published: resolved.timestamp ?? 0,
    publishedText: publishedText({
      timestamp: resolved.timestamp,
      upload_date: resolved.upload_date,
    }),
    viewCount: resolved.view_count ?? 0,
    likeCount: resolved.like_count,
    lengthSeconds: resolved.duration ?? 0,
    paid: false,
    premium: false,
    liveNow: false,
    isUpcoming: false,
  };
}

function detailFromResult(result: VideoResult, playback: ResolvedDownloadStream): VideoDetail {
  const stream = streamFromResolved(playback);
  return {
    ...result,
    formatStreams: [stream],
    adaptiveFormats: [stream],
    hlsUrl: stream.container === 'hls' ? playback.url : undefined,
    dashUrl: stream.container === 'dash' ? playback.url : undefined,
    recommendedVideos: [],
    authorThumbnails: [],
    subCountText: '',
    allowRatings: true,
    rating: 0,
    isFamilyFriendly: true,
    genre: '',
    keywords: [],
  };
}

async function getBackendVideoDetail(videoId: string): Promise<VideoDetail | null> {
  const playback = await tryYtdlpPlayback(videoId);
  if (playback) {
    return detailFromResult(resultFromResolved(videoId, playback), playback);
  }

  const ytdlpInfo = await tryYtdlpExtract(youtubeUrl(videoId), false, 1);
  if (ytdlpInfo) {
    return mapYtdlpDetail(ytdlpInfo);
  }

  return null;
}

export async function getPublicVideoDetail(videoId: string): Promise<VideoDetail | null> {
  try {
    return await tryInvidious<VideoDetail>(`/api/v1/videos/${videoId}`);
  } catch {
    try {
      const pipedResult = await tryPiped<PipedDetail>(`/streams/${videoId}`);
      return mapPipedDetail(videoId, pipedResult);
    } catch {
      return null;
    }
  }
}

export async function getVideoDetail(videoId: string): Promise<VideoDetail | null> {
  const publicDetailPromise = getPublicVideoDetail(videoId);
  const backendDetail = await getBackendVideoDetail(videoId);
  return backendDetail ?? publicDetailPromise;
}
