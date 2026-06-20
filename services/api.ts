import { create, type AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import {
  DownloadFormat,
  SearchParams,
  SearchType,
  VideoDetail,
  VideoResult,
  VideoStream,
  VideoThumbnail,
} from '@/types';
import type { ResolvedDownloadStream } from './api/apiTypes';
import { getVideoDetail as getNewPipeVideoDetail } from './api/providers/newpipeAndroidProvider';
import {
  getPublicVideoDetail,
  getVideoDetail as getYtdlpVideoDetail,
} from './api/providers/ytdlpBackendProvider';

export type { ResolvedDownloadStream } from './api/apiTypes';

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

const CATEGORY_QUERIES = {
  music: 'new music videos today',
  gaming: 'new gaming videos today',
  news: 'latest news today',
  sports: 'latest sports highlights today',
  podcasts: 'new podcast episodes today',
} as const;
const FALLBACK_TRENDING_REGION = 'US';

export type FeedCategory = 'all' | keyof typeof CATEGORY_QUERIES;

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
  entries?: YtdlpInfo[];
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

let activeInvidiousInstance = INVIDIOUS_INSTANCES[0];
let activePipedInstance = PIPED_INSTANCES[0];
let activeYtdlpApiUrl: string | null = null;
let lastYtdlpHealthCheck = 0;

const client: AxiosInstance = create({ timeout: 15000 });

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = String(error?.config?.url ?? '');
    if (!error?.response) {
      const isLocalBackend = requestUrl.includes(':8787');
      return Promise.reject(
        new Error(
          isLocalBackend
            ? 'Backend server unavailable. Start the backend or check your connection.'
            : 'Network service unavailable. Check your connection and try again.'
        )
      );
    }
    return Promise.reject(error);
  }
);

function textValue(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const maybeText = value as {
    simpleText?: string;
    runs?: { text?: string }[];
  };
  return maybeText.simpleText ?? maybeText.runs?.map((run) => run.text ?? '').join('') ?? '';
}

function parseCompactNumber(text: string): number {
  const normalized = text
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  const match = normalized.match(/([\d.,]+)\s*([KMB])?/i);
  if (!match) return 0;

  const raw = match[1].replace(/,/g, '');
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;

  const suffix = match[2]?.toUpperCase();
  if (suffix === 'B') return Math.round(value * 1_000_000_000);
  if (suffix === 'M') return Math.round(value * 1_000_000);
  if (suffix === 'K') return Math.round(value * 1_000);
  return Math.round(value);
}

function parseDurationText(text: string): number {
  const parts = text.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function extractBalancedJson(source: string, marker: string): string | null {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = source.indexOf('{', markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return null;
}

interface YoutubeRenderer {
  videoId?: string;
  title?: unknown;
  ownerText?: unknown;
  longBylineText?: unknown;
  thumbnail?: { thumbnails?: { url?: string; width?: number; height?: number }[] };
  descriptionSnippet?: unknown;
  publishedTimeText?: unknown;
  viewCountText?: unknown;
  shortViewCountText?: unknown;
  lengthText?: unknown;
}

function mapYoutubeRenderer(renderer: YoutubeRenderer): VideoResult | null {
  if (!renderer.videoId) return null;
  const thumbnails = renderer.thumbnail?.thumbnails ?? [];
  return {
    videoId: renderer.videoId,
    title: textValue(renderer.title) || 'Untitled video',
    author: textValue(renderer.ownerText) || textValue(renderer.longBylineText) || 'Unknown',
    authorId: '',
    authorUrl: '',
    videoThumbnails: thumbnails
      .filter((thumbnail) => !!thumbnail.url)
      .map((thumbnail, index) => ({
        quality: String(index),
        url: thumbnail.url!.startsWith('//') ? `https:${thumbnail.url}` : thumbnail.url!,
        width: thumbnail.width ?? 0,
        height: thumbnail.height ?? 0,
      })),
    description: textValue(renderer.descriptionSnippet),
    published: 0,
    publishedText: textValue(renderer.publishedTimeText) || 'Recently',
    viewCount: parseCompactNumber(textValue(renderer.viewCountText) || textValue(renderer.shortViewCountText)),
    lengthSeconds: parseDurationText(textValue(renderer.lengthText)),
    paid: false,
    premium: false,
    liveNow: false,
    isUpcoming: false,
  };
}

function parseYoutubeInitialData(html: string, limit: number): VideoResult[] {
  const jsonText =
    extractBalancedJson(html, 'var ytInitialData =') ??
    extractBalancedJson(html, 'window["ytInitialData"] =') ??
    extractBalancedJson(html, 'ytInitialData =');
  if (!jsonText) return [];

  let initialData: unknown;
  try {
    initialData = JSON.parse(jsonText);
  } catch {
    return [];
  }

  const results: VideoResult[] = [];
  const seen = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || results.length >= limit) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== 'object') return;

    const objectValue = value as { videoRenderer?: YoutubeRenderer };
    if (objectValue.videoRenderer) {
      const mapped = mapYoutubeRenderer(objectValue.videoRenderer);
      if (mapped && !seen.has(mapped.videoId)) {
        seen.add(mapped.videoId);
        results.push(mapped);
      }
    }
    Object.values(value).forEach(walk);
  };

  walk(initialData);
  return results;
}

async function tryYoutubeWebSearch(query: string, limit = 20): Promise<VideoResult[]> {
  try {
    const res = await client.get<string>('https://www.youtube.com/results', {
      params: {
        search_query: query,
        hl: 'en',
        gl: 'US',
      },
      responseType: 'text',
      timeout: 9000,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return parseYoutubeInitialData(String(res.data), limit);
  } catch {
    return [];
  }
}

async function tryYoutubeTrendingWeb(region = 'US', limit = 20): Promise<VideoResult[]> {
  try {
    const res = await client.get<string>('https://www.youtube.com/feed/trending', {
      params: {
        hl: 'en',
        gl: region,
      },
      responseType: 'text',
      timeout: 9000,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    return parseYoutubeInitialData(String(res.data), limit);
  } catch {
    return [];
  }
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

function fallbackVideo(videoId: string, title: string, author: string, description = '', viewCount = 0): VideoResult {
  return {
    videoId,
    title,
    author,
    authorId: '',
    authorUrl: '',
    videoThumbnails: fallbackThumb(videoId),
    description,
    published: 0,
    publishedText: 'Available',
    viewCount,
    lengthSeconds: 0,
    paid: false,
    premium: false,
    liveNow: false,
    isUpcoming: false,
  };
}

const FALLBACK_FEED: VideoResult[] = [
  fallbackVideo('jNQXAC9IVRw', 'Me at the zoo', 'jawed', 'The first video uploaded to YouTube.', 391_000_000),
  fallbackVideo('O12HUhCIZSw', 'Nu - MAN O TO (Original Mix)', 'Hamid Moghadam', '', 76_000_000),
  fallbackVideo('kJQP7kiw5Fk', 'Luis Fonsi - Despacito ft. Daddy Yankee', 'Luis Fonsi', '', 8_700_000_000),
  fallbackVideo('9bZkp7q19f0', 'PSY - GANGNAM STYLE', 'officialpsy', '', 5_400_000_000),
  fallbackVideo('M7lc1UVf-VE', 'YouTube Developers Live: Embedded Web Player Customization', 'Google Developers', '', 2_900_000),
];

function fallbackResultsForQuery(query: string): VideoResult[] {
  const normalized = query.toLowerCase();
  if (normalized.includes('music') || normalized.includes('song')) {
    return FALLBACK_FEED.slice(1, 4);
  }
  return FALLBACK_FEED;
}

export function getFallbackFeed(category: FeedCategory = 'all'): VideoResult[] {
  if (category === 'music') return fallbackResultsForQuery('music');
  return FALLBACK_FEED;
}

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

  // Axios timeouts are not equally reliable across RN transports; this JS timer guarantees
  // one bad endpoint cannot hold the whole fallback chain open.
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

    return await response.json() as T;
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
  return [resolved.url, resolved.ext, resolved.container, resolved.quality]
    .join(' ')
    .toLowerCase()
    .includes('hls') || /\.m3u8($|[?#])/.test(resolved.url);
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

export async function resolveAudioPlaybackStream(videoId: string): Promise<ResolvedDownloadStream | null> {
  for (const baseUrl of await getReachableYtdlpApiUrls()) {
    try {
      const res = await client.post<ResolvedDownloadStream>(
        `${baseUrl}/audio`,
        { url: youtubeUrl(videoId) },
        { timeout: 12000 }
      );
      activeYtdlpApiUrl = baseUrl;
      return res.data;
    } catch {}
  }
  return null;
}

async function tryYtdlpFeed(query: string, limit = 20): Promise<VideoResult[]> {
  for (const baseUrl of await getReachableYtdlpApiUrls()) {
    try {
      const res = await client.get<VideoResult[]>(`${baseUrl}/feed`, {
        params: { q: query, limit },
        timeout: 12000,
      });
      activeYtdlpApiUrl = baseUrl;
      return res.data ?? [];
    } catch {}
  }
  return [];
}

function mapTypeToInvidious(type: SearchType): string {
  switch (type) {
    case 'music': return 'video';
    case 'channel': return 'channel';
    case 'playlist': return 'playlist';
    default: return 'video';
  }
}

function getDeviceRegion(): string {
  if (typeof Intl === 'undefined') return FALLBACK_TRENDING_REGION;
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const region = locale
    .replace(/_/g, '-')
    .split('-')
    .map((part) => part.toUpperCase())
    .find((part) => /^[A-Z]{2}$/.test(part));
  return region ?? FALLBACK_TRENDING_REGION;
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

function mapYtdlpDetail(info: YtdlpInfo): VideoDetail {
  const result = mapYtdlpResult(info);
  const mappedFormats = (info.formats ?? []).map(mapYtdlpFormat).filter((format): format is VideoStream => !!format);
  const resolvedStream = info.url && (info.ext || info.container || info.quality || info.height || info.bitrate || info.headers)
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

function videoIdFromUrl(url: string | undefined, fallback = ''): string {
  if (!url) return fallback;
  const match = url.match(/[?&]v=([^&]+)/) ?? url.match(/\/watch\/([^/?]+)/);
  return decodeURIComponent(match?.[1] ?? fallback);
}

function mapPipedRelated(item: PipedRelatedStream): VideoResult | null {
  const videoId = videoIdFromUrl(item.url);
  if (!videoId) return null;
  return {
    videoId,
    title: item.title ?? 'Video',
    author: item.uploaderName ?? 'Unknown',
    authorId: videoIdFromUrl(item.uploaderUrl),
    authorUrl: item.uploaderUrl ?? '',
    videoThumbnails: item.thumbnail
      ? [{ quality: 'default', url: item.thumbnail, width: 0, height: 0 }]
      : fallbackThumb(videoId),
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

function mapYtdlpEntries(info: YtdlpInfo | null): VideoResult[] {
  if (!info) return [];
  const entries = Array.isArray(info.entries) ? info.entries : [info];
  return entries
    .filter((entry) => entry && (entry.id || entry.url || entry.webpage_url))
    .map(mapYtdlpResult);
}

function mergeVideoResults(primary: VideoResult[], secondary: VideoResult[], limit: number): VideoResult[] {
  const seen = new Set<string>();
  const merged: VideoResult[] = [];
  [...primary, ...secondary].forEach((item) => {
    if (!item.videoId || seen.has(item.videoId) || merged.length >= limit) return;
    seen.add(item.videoId);
    merged.push(item);
  });
  return merged;
}

export async function searchVideos(params: SearchParams): Promise<VideoResult[]> {
  const page = params.page ?? 1;
  if (page === 1 && ((params.type ?? 'video') === 'video' || params.type === 'music')) {
    const query = params.type === 'music' ? `${params.query} music` : params.query;
    const backendResults = await tryYtdlpFeed(query, 20);
    if (backendResults.length > 0) return backendResults;

    const youtubeResults = await tryYoutubeWebSearch(query, 20);
    if (youtubeResults.length > 0) return youtubeResults;
  }

  try {
    const results = await tryInvidious<VideoResult[]>('/api/v1/search', {
      q: params.query,
      type: mapTypeToInvidious(params.type ?? 'video'),
      sort_by: params.sort ?? 'relevance',
      page: params.page ?? 1,
    });
    if (results?.length > 0) return results;
  } catch {
    if (page === 1) try {
      const pipedResult = await tryPiped<{ items: PipedRelatedStream[] }>('/search', {
        q: params.query,
        filter: params.type === 'music' ? 'music_songs' : 'videos',
      });
      const pipedVideos = (pipedResult.items ?? [])
        .map(mapPipedRelated)
        .filter((item): item is VideoResult => !!item);
      if (pipedVideos.length > 0) return pipedVideos;
    } catch {}
  }

  if (page === 1 && ((params.type ?? 'video') === 'video' || params.type === 'music')) {
    const ytdlpQuery = params.type === 'music' ? `${params.query} music` : params.query;
    const ytdlpResults = mapYtdlpEntries(await tryYtdlpExtract(`ytsearch20:${ytdlpQuery}`, true, 20, 20000));
    if (ytdlpResults.length > 0) return ytdlpResults;
  }

  if (page > 1) return [];
  return fallbackResultsForQuery(params.query);
}

async function searchPagesUntilLimit(
  params: SearchParams,
  limit: number,
  seed: VideoResult[] = []
): Promise<VideoResult[]> {
  let results = seed;
  const pageCount = Math.ceil(limit / 20);
  for (let page = 1; page <= pageCount && results.length < limit; page += 1) {
    const pageResults = await searchVideos({ ...params, page });
    const nextResults = mergeVideoResults(results, pageResults, limit);
    if (nextResults.length === results.length) break;
    results = nextResults;
  }
  return results;
}

export async function getTrending(region = getDeviceRegion(), limit = 20): Promise<VideoResult[]> {
  let results = await tryYoutubeTrendingWeb(region, limit);
  if (results.length >= limit) return results;

  try {
    const invidiousResults = await tryInvidious<VideoResult[]>('/api/v1/trending', { region, type: 'default' });
    results = mergeVideoResults(results, invidiousResults ?? [], limit);
    if (results.length >= limit) return results;
  } catch {
    try {
      const pipedResults = await tryPiped<VideoResult[]>('/trending', { region });
      results = mergeVideoResults(results, pipedResults ?? [], limit);
      if (results.length >= limit) return results;
    } catch {}
  }

  const backendResults = await tryYtdlpFeed(`trending videos today ${region}`, Math.min(limit, 50));
  results = mergeVideoResults(results, backendResults, limit);
  if (results.length >= limit) return results;

  const ytdlpLimit = Math.min(limit, 50);
  const ytdlpResults = mapYtdlpEntries(await tryYtdlpExtract(`ytsearch${ytdlpLimit}:trending videos today`, true, ytdlpLimit, 12000));
  results = mergeVideoResults(results, ytdlpResults, limit);
  if (results.length >= limit) return results;

  const youtubeSearchResults = await tryYoutubeWebSearch('trending videos today', limit);
  results = mergeVideoResults(results, youtubeSearchResults, limit);
  if (results.length > 0) return results;

  return FALLBACK_FEED;
}

export async function getMusicTrending(limit = 20, region = getDeviceRegion()): Promise<VideoResult[]> {
  let results: VideoResult[] = [];
  try {
    const trendingResults = await tryInvidious<VideoResult[]>('/api/v1/trending', { region, type: 'music' });
    results = mergeVideoResults(results, trendingResults, limit);
    if (results.length >= limit) return results;
  } catch {}

  const feedResults = await tryYtdlpFeed(`${CATEGORY_QUERIES.music} ${region}`, Math.min(limit, 50));
  results = mergeVideoResults(results, feedResults, limit);
  if (results.length >= limit) return results;

  return searchPagesUntilLimit(
    { query: `${CATEGORY_QUERIES.music} ${region}`, type: 'music', sort: 'upload_date' },
    limit,
    results
  );
}

export async function getCategoryFeed(category: FeedCategory, limit = 20): Promise<VideoResult[]> {
  const region = getDeviceRegion();
  if (category === 'all') return getTrending(region, limit);
  if (category === 'music') return getMusicTrending(limit, region);
  const query = `${CATEGORY_QUERIES[category]} ${region}`;
  const feedResults = await tryYtdlpFeed(query, Math.min(limit, 50));
  if (feedResults.length >= limit) return feedResults;
  return searchPagesUntilLimit({ query, sort: 'upload_date' }, limit, feedResults);
}

export async function getVideoDetail(videoId: string): Promise<VideoDetail | null> {
  if (Platform.OS === 'android') {
    return getNewPipeVideoDetail(videoId);
  }

  // Start the public fallback in parallel, but prefer backend playback whenever it succeeds.
  // Otherwise iOS can receive a raw public HLS URL before the backend proxy is ready.
  return getYtdlpVideoDetail(videoId);
}

export async function getRecommendedVideos(videoId: string, query = ''): Promise<VideoResult[]> {
  if (query) {
    const searchResults = await searchVideos({ query, type: 'video' });
    const nextVideos = searchResults.filter((item) => item.videoId && item.videoId !== videoId);
    if (nextVideos.length > 0) return nextVideos;
  }

  const detail = await getPublicVideoDetail(videoId);
  return detail?.recommendedVideos ?? [];
}

export async function resolveDownloadStream(videoId: string, format: DownloadFormat): Promise<ResolvedDownloadStream | null> {
  for (const baseUrl of await getReachableYtdlpApiUrls()) {
    try {
      const res = await client.post<ResolvedDownloadStream>(
        `${baseUrl}/resolve`,
        { url: youtubeUrl(videoId), format },
        { timeout: 45000 }
      );
      activeYtdlpApiUrl = baseUrl;
      return res.data;
    } catch {}
  }
  return null;
}

export async function getChannel(channelId: string): Promise<unknown> {
  try {
    return await tryInvidious(`/api/v1/channels/${channelId}`);
  } catch {
    return null;
  }
}

function normalizeThumbnailUrl(url: string): string {
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/vi/') || url.startsWith('/vi_webp/')) return `https://i.ytimg.com${url}`;
  if (url.startsWith('/')) return `${activeInvidiousInstance}${url}`;
  return url;
}

export function getBestThumbnail(thumbnails: { url: string; quality: string; width?: number; height?: number }[]): string {
  const preferred = ['maxresdefault', 'sddefault', 'high', 'medium', 'default'];
  for (const quality of preferred) {
    const thumb = thumbnails.find((t) => t.quality === quality);
    if (thumb?.url) return normalizeThumbnailUrl(thumb.url);
  }
  const largest = [...thumbnails].sort((a, b) => (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0))[0];
  return largest?.url ? normalizeThumbnailUrl(largest.url) : normalizeThumbnailUrl(thumbnails[0]?.url ?? '');
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatViewCount(count: number | null | undefined): string {
  if (count == null) return '0';
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B`;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}
