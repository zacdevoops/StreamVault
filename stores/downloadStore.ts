import { create } from 'zustand';
import { DownloadItem } from '@/types';

interface DownloadStore {
  downloads: Record<string, DownloadItem>;
  addDownload: (item: DownloadItem) => void;
  updateDownload: (id: string, partial: Partial<DownloadItem>) => void;
  removeDownload: (id: string) => void;
  getActiveDownloads: () => DownloadItem[];
  getCompletedDownloads: () => DownloadItem[];
  getAudioDownloads: () => DownloadItem[];
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  downloads: {},
  addDownload: (item) =>
    set((s) => ({ downloads: { ...s.downloads, [item.id]: item } })),
  updateDownload: (id, partial) =>
    set((s) => ({
      downloads: {
        ...s.downloads,
        [id]: s.downloads[id] ? { ...s.downloads[id], ...partial } : s.downloads[id],
      },
    })),
  removeDownload: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.downloads;
      return { downloads: rest };
    }),
  getActiveDownloads: () =>
    Object.values(get().downloads).filter(
      (d) => d.status === 'downloading' || d.status === 'pending' || d.status === 'paused'
    ),
  getCompletedDownloads: () =>
    Object.values(get().downloads).filter((d) => d.status === 'completed'),
  getAudioDownloads: () =>
    Object.values(get().downloads).filter((d) => {
      const format = d?.format as string | undefined;
      if (!format) return false;
      return format === 'audio_best' || format === 'flac'
        || format === 'mp3_128' || format === 'mp3_320';
    }),
}));
