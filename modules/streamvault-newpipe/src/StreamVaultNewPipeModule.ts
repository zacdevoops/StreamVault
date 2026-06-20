import { requireOptionalNativeModule } from 'expo-modules-core';

type StreamVaultNewPipeNativeModule = {
  ping: () => Promise<string>;
};

const NativeModule = requireOptionalNativeModule<StreamVaultNewPipeNativeModule>('StreamVaultNewPipe');

export async function ping(): Promise<string> {
  if (!NativeModule?.ping) {
    throw new Error('StreamVaultNewPipe native module is unavailable.');
  }
  return NativeModule.ping();
}

export function isStreamVaultNewPipeAvailable(): boolean {
  return Boolean(NativeModule?.ping);
}
