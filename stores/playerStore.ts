import { create } from 'zustand';

interface PlayerStore {
  miniPlayerVisible: boolean;
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  miniPlayerVisible: false,
  showMiniPlayer: () => set({ miniPlayerVisible: true }),
  hideMiniPlayer: () => set({ miniPlayerVisible: false }),
}));
