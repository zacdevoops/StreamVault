import type { VideoDetail } from '@/types';
import { requireOptionalNativeModule } from 'expo-modules-core';

type StreamVaultNewPipeNativeModule = {
  ping: () => Promise<string>;
  getVideoDetail: (videoId: string) => Promise<VideoDetail>;
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

export function isStreamVaultNewPipeAvailable(): boolean {
  return Boolean(NativeModule?.getVideoDetail);
}
