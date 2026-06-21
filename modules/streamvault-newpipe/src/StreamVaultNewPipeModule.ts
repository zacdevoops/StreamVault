import type { ResolvedDownloadStream } from '@/services/api/apiTypes';
import type { VideoDetail, VideoResult } from '@/types';
import { requireOptionalNativeModule } from 'expo-modules-core';

type NewPipeDownloadFormat = 'mp4_360p' | 'mp4_720p' | 'mp3_128' | 'mp3_320';

type StreamVaultNewPipeNativeModule = {
  ping: () => Promise<string>;
  getVideoDetail: (videoId: string) => Promise<VideoDetail>;
  searchVideos: (query: string, searchType: string, page: number) => Promise<VideoResult[]>;
  getFeed: (category: string, region: string, limit: number) => Promise<VideoResult[]>;
  resolveDownloadStream: (videoId: string, format: string) => Promise<ResolvedDownloadStream | null>;
  mergeDownloadStreams?: (videoPath: string, audioPath: string, outputPath: string) => Promise<string>;
};

const NativeModule = requireOptionalNativeModule<StreamVaultNewPipeNativeModule>('StreamVaultNewPipe');

export async function ping(): Promise<string> {
  if (!NativeModule?.ping) {
    throw new Error('StreamVaultNewPipe native module is unavailable.');
  }
  return NativeModule.ping();
}

export async function getVideoDetail(videoId: string): Promise<VideoDetail> {
  if (!NativeModule?.getVideoDetail) {
    throw new Error('StreamVaultNewPipe getVideoDetail is unavailable.');
  }
  return NativeModule.getVideoDetail(videoId);
}

export async function searchVideos(params: {
  query: string;
  type?: 'video' | 'music' | 'channel' | 'playlist';
  page?: number;
}): Promise<VideoResult[]> {
  if (!NativeModule?.searchVideos) {
    throw new Error('StreamVaultNewPipe searchVideos is unavailable.');
  }
  return NativeModule.searchVideos(params.query, params.type ?? 'video', params.page ?? 1);
}

export async function getFeed(params: {
  category: string;
  region: string;
  limit: number;
}): Promise<VideoResult[]> {
  if (!NativeModule?.getFeed) {
    throw new Error('StreamVaultNewPipe getFeed is unavailable.');
  }
  return NativeModule.getFeed(params.category, params.region, params.limit);
}

export async function resolveDownloadStream(
  videoId: string,
  format: NewPipeDownloadFormat
): Promise<ResolvedDownloadStream | null> {
  if (!NativeModule?.resolveDownloadStream) {
    return null;
  }
  return NativeModule.resolveDownloadStream(videoId, format);
}

export async function mergeDownloadStreams(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<string | null> {
  if (!NativeModule?.mergeDownloadStreams) {
    return null;
  }
  return NativeModule.mergeDownloadStreams(videoPath, audioPath, outputPath);
}

export function isStreamVaultNewPipeAvailable(): boolean {
  return Boolean(NativeModule?.getVideoDetail);
}
