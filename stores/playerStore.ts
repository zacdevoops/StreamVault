import { create } from 'zustand';
import { PlayerState } from '@/types';

interface PlayerStore {
  player: PlayerState | null;
  miniPlayerVisible: boolean;
  setPlayer: (state: PlayerState) => void;
  updatePlayer: (partial: Partial<PlayerState>) => void;
  clearPlayer: () => void;
  showMiniPlayer: () => void;
  hideMiniPlayer: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  player: null,
  miniPlayerVisible: false,
  setPlayer: (state) => set({ player: state, miniPlayerVisible: state.isAudioOnly }),
  updatePlayer: (partial) =>
    set((s) => ({ player: s.player ? { ...s.player, ...partial } : null })),
  clearPlayer: () => set({ player: null, miniPlayerVisible: false }),
  showMiniPlayer: () => set({ miniPlayerVisible: true }),
  hideMiniPlayer: () => set({ miniPlayerVisible: false }),
}));
