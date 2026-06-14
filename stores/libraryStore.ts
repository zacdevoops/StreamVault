import { create } from 'zustand';
import { LibraryItem } from '@/types';

type LibraryItemInput = Omit<LibraryItem, 'type' | 'id' | 'watchedAt'>;

interface LibraryStore {
  history: LibraryItem[];
  liked: LibraryItem[];
  saved: LibraryItem[];
  addToHistory: (item: LibraryItemInput) => void;
  toggleLike: (item: LibraryItemInput) => void;
  toggleSave: (item: LibraryItemInput) => void;
  clearHistory: () => void;
  isLiked: (videoId: string) => boolean;
  isSaved: (videoId: string) => boolean;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  history: [],
  liked: [],
  saved: [],
  addToHistory: (item) => {
    const existing = get().history.find((h) => h.videoId === item.videoId);
    const entry: LibraryItem = {
      ...item,
      id: item.videoId,
      type: 'history',
      watchedAt: Date.now(),
    };
    if (existing) {
      set((s) => ({
        history: s.history.map((h) => (h.videoId === item.videoId ? entry : h)),
      }));
    } else {
      set((s) => ({ history: [entry, ...s.history].slice(0, 200) }));
    }
  },
  toggleLike: (item) => {
    const isLiked = get().liked.some((l) => l.videoId === item.videoId);
    if (isLiked) {
      set((s) => ({ liked: s.liked.filter((l) => l.videoId !== item.videoId) }));
    } else {
      set((s) => ({
        liked: [
          { ...item, id: item.videoId, type: 'liked', watchedAt: Date.now() },
          ...s.liked,
        ],
      }));
    }
  },
  toggleSave: (item) => {
    const isSaved = get().saved.some((s) => s.videoId === item.videoId);
    if (isSaved) {
      set((s) => ({ saved: s.saved.filter((sv) => sv.videoId !== item.videoId) }));
    } else {
      set((s) => ({
        saved: [
          { ...item, id: item.videoId, type: 'saved', watchedAt: Date.now() },
          ...s.saved,
        ],
      }));
    }
  },
  clearHistory: () => set({ history: [] }),
  isLiked: (videoId) => get().liked.some((l) => l.videoId === videoId),
  isSaved: (videoId) => get().saved.some((s) => s.videoId === videoId),
}));
