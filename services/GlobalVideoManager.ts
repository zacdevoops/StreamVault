import { AppState, Platform, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import type { VideoPlayer, VideoPlayerStatus, VideoSource } from 'expo-video';
import { isSameVideoId, isSameVideoSession, normalizeVideoId } from '@/services/playbackSession';

import { mergeYoutubePlaybackHeaders } from './youtubePlaybackHeaders';

declare const __DEV__: boolean;

export type GlobalVideoTrack = {
  id?: string;
  fileUri: string;
  title?: string;
  author?: string;
  thumbnail?: string;
  isAudioOnly?: boolean;
  headers?: Record<string, string>;
  contentType?: 'progressive' | 'hls' | 'dash';
};

export type GlobalVideoSnapshot = {
  currentTrack: GlobalVideoTrack | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  status: VideoPlayerStatus;
  error: string | null;
  timedOut: boolean;
};

type Listener = (snapshot: GlobalVideoSnapshot) => void;

const INITIAL_STATE: GlobalVideoSnapshot = {
  currentTrack: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  status: 'idle',
  error: null,
  timedOut: false,
};

class GlobalVideoManager {
  private static instance: GlobalVideoManager | null = null;
  private listeners = new Set<Listener>();
  private player: VideoPlayer | null = null;
  private snapshot: GlobalVideoSnapshot = INITIAL_STATE;
  private requestId = 0;
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription: NativeEventSubscription | null = null;
  private loadingTimeout: ReturnType<typeof setTimeout> | null = null;
  private wasInterrupted = false;
  private backgroundPlaybackEnabled = true;
  private playToEndHandler: (() => void) | null = null;
  private suppressPlayToEnd = false;

  private constructor() {
    this.startAppStateListener();
  }

  static getInstance(): GlobalVideoManager {
    // A single JS manager gives every screen one authority for playback decisions.
    if (!GlobalVideoManager.instance) {
      GlobalVideoManager.instance = new GlobalVideoManager();
    }
    return GlobalVideoManager.instance;
  }

  bindPlayer(player: VideoPlayer) {
    if (this.player === player) return;
    this.startAppStateListener();

    // The React provider owns the native player lifecycle; the singleton only commands it.
    this.player = player;
    this.player.timeUpdateEventInterval = 0.5;
    this.player.staysActiveInBackground = this.backgroundPlaybackEnabled;
    this.player.showNowPlayingNotification = this.backgroundPlaybackEnabled;
    this.player.audioMixingMode = 'doNotMix';
    this.updateNowPlayingInfo(this.snapshot.currentTrack);
  }

  unbindPlayer(player: VideoPlayer) {
    if (this.player !== player) return;

    // Pausing before unbinding prevents orphaned native audio if the provider unmounts.
    this.requestId += 1;
    this.safePause();
    this.clearLoadingTimeout();
    this.player = null;
    this.setSnapshot(INITIAL_STATE);
  }

  destroy() {
    this.requestId += 1;
    this.safePause();
    this.clearLoadingTimeout();
    this.stopAppStateListener();
    this.player = null;
    this.wasInterrupted = false;
    this.setSnapshot(INITIAL_STATE);
    this.listeners.clear();
  }

  getSnapshot(): GlobalVideoSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  setBackgroundPlaybackEnabled(enabled: boolean) {
    this.backgroundPlaybackEnabled = enabled;
    if (this.player) {
      this.player.staysActiveInBackground = enabled;
      this.player.showNowPlayingNotification = enabled;
    }
  }

  setPlayToEndHandler(handler: (() => void) | null) {
    this.playToEndHandler = handler;
  }

  syncFromNativePlayer() {
    this.resyncFromNativePlayer();
  }

  isActiveVideoSession(videoId: string): boolean {
    const normalized = normalizeVideoId(videoId);
    if (!normalized || !isSameVideoId(this.snapshot.currentTrack?.id, normalized)) return false;
    if (this.snapshot.status === 'error' || this.snapshot.timedOut) return false;

    const player = this.player;
    if (player && (player.duration > 0 || player.currentTime > 0)) return true;

    return (
      this.snapshot.isPlaying ||
      this.snapshot.status === 'readyToPlay' ||
      this.snapshot.status === 'loading' ||
      this.snapshot.position > 0 ||
      this.snapshot.duration > 0
    );
  }

  updateSessionMetadata(partial: Partial<GlobalVideoTrack>): void {
    const current = this.snapshot.currentTrack;
    if (!current) return;

    const nextTrack: GlobalVideoTrack = {
      ...current,
      ...partial,
      id: current.id ?? partial.id,
      fileUri: current.fileUri,
    };
    this.resyncFromNativePlayer();
    this.setSnapshot({ ...this.snapshot, currentTrack: nextTrack });
    this.updateNowPlayingInfo(nextTrack);
  }

  async play(fileUri: string, track: Partial<GlobalVideoTrack> = {}) {
    const player = this.player;
    if (!player) return;

    const nextTrack: GlobalVideoTrack = {
      ...track,
      fileUri,
    };
    const sameVideoSession = isSameVideoSession(this.snapshot.currentTrack, nextTrack);
    const sessionTrack = sameVideoSession && this.snapshot.currentTrack
      ? { ...nextTrack, fileUri: this.snapshot.currentTrack.fileUri }
      : nextTrack;
    const shouldReloadTrack =
      !sameVideoSession || this.snapshot.timedOut || this.snapshot.status === 'error';
    const currentRequest = ++this.requestId;

    if (shouldReloadTrack) {
      // Stopping first is the key global invariant: no previous source can keep emitting audio.
      this.safePause();
      this.setSnapshot({
        ...this.snapshot,
        currentTrack: sessionTrack,
        isPlaying: false,
        position: 0,
        duration: 0,
        status: 'loading',
        error: null,
        timedOut: false,
      });
      this.startLoadingTimeout(currentRequest);
      this.updateNowPlayingInfo(sessionTrack);

      try {
        // Replacing the source reuses the one native VideoPlayer instead of creating another.
        const source = this.sourceFromTrack(sessionTrack);
        if (__DEV__) {
          console.log('[GlobalVideoManager] replaceAsync source', source);
        }
        await player.replaceAsync(source);
      } catch (err) {
        if (currentRequest !== this.requestId || this.player !== player) return;
        this.setSnapshot({
          ...this.snapshot,
          isPlaying: false,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          timedOut: false,
        });
        this.clearLoadingTimeout();
        return;
      }
      if (currentRequest !== this.requestId || this.player !== player) return;
      player.currentTime = 0;
    } else {
      this.resyncFromNativePlayer();
      this.setSnapshot({
        ...this.snapshot,
        currentTrack: sessionTrack,
        error: null,
        timedOut: false,
      });
      this.updateNowPlayingInfo(sessionTrack);
    }

    try {
      if (currentRequest !== this.requestId || this.player !== player) return;
      player.play();
    } catch (err) {
      if (currentRequest !== this.requestId || this.player !== player) return;
      this.setSnapshot({
        ...this.snapshot,
        isPlaying: false,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        timedOut: false,
      });
      this.clearLoadingTimeout();
      return;
    }
    this.setSnapshot({
      ...this.snapshot,
      isPlaying: true,
      status: player.status,
      error: null,
      timedOut: false,
    });
  }

  pause() {
    this.safePause();
    this.wasInterrupted = false;
    if (!this.snapshot.isPlaying) return;
    this.setSnapshot({ ...this.snapshot, isPlaying: false });
  }

  async stop() {
    const player = this.player;
    const currentRequest = ++this.requestId;
    this.safePause();
    this.clearLoadingTimeout();
    this.wasInterrupted = false;

    if (player) {
      // Loading a null source releases the current item without disposing the reusable player.
      this.suppressPlayToEnd = true;
      try {
        await player.replaceAsync(null);
      } catch {} finally {
        setTimeout(() => {
          this.suppressPlayToEnd = false;
        }, 250);
      }
    }
    if (currentRequest !== this.requestId || this.player !== player) return;
    this.setSnapshot(INITIAL_STATE);
  }

  handleStatusChange(status: VideoPlayerStatus, error?: string) {
    if (status === 'readyToPlay' || status === 'error') {
      this.clearLoadingTimeout();
    }

    this.setSnapshot({
      ...this.snapshot,
      status,
      error: status === 'error' ? error ?? 'Unable to play this download.' : null,
      timedOut: false,
    });
  }

  handlePlayingChange(isPlaying: boolean) {
    // iOS interruptions arrive as native playback changes; preserve state without fighting the system.
    if (!isPlaying && this.snapshot.isPlaying && this.appState !== 'active') {
      this.wasInterrupted = true;
    }
    this.setSnapshot({ ...this.snapshot, isPlaying });
  }

  handleTimeUpdate(position: number) {
    this.setSnapshot({ ...this.snapshot, position });
  }

  handleSourceLoad(duration: number) {
    this.clearLoadingTimeout();
    this.setSnapshot({ ...this.snapshot, duration });
  }

  handlePlayToEnd() {
    if (this.suppressPlayToEnd) return;
    this.setSnapshot({ ...this.snapshot, isPlaying: false, position: this.snapshot.duration });
    this.playToEndHandler?.();
  }

  updateNowPlayingInfo(track = this.snapshot.currentTrack) {
    const player = this.player;
    if (!player || !track) return;

    // Expo-video maps VideoSource.metadata to MPNowPlayingInfoCenter on iOS.
    // Reasserting these flags on every track change keeps lock-screen title, artist, artwork,
    // progress, and remote play/pause/seek controls attached to the one reusable player.
    player.showNowPlayingNotification = this.backgroundPlaybackEnabled;
    player.staysActiveInBackground = this.backgroundPlaybackEnabled;
    player.audioMixingMode = 'doNotMix';
  }

  private startAppStateListener() {
    if (this.appStateSubscription) return;

    this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const previousState = this.appState;
      this.appState = nextState;

      if (nextState === 'background' || nextState === 'inactive') {
        if (!this.backgroundPlaybackEnabled) {
          this.safePause();
          this.setSnapshot({ ...this.snapshot, isPlaying: false });
        } else {
          // Background transitions must not pause local media; iOS will keep it alive via AVAudioSession.
          this.updateNowPlayingInfo();
        }
        return;
      }

      if (previousState !== 'active' && nextState === 'active') {
        // On return, trust native player truth because lock-screen controls may have changed playback.
        this.resyncFromNativePlayer();
      }
    });
  }

  private stopAppStateListener() {
    if (!this.appStateSubscription) return;
    this.appStateSubscription.remove();
    this.appStateSubscription = null;
  }

  private resyncFromNativePlayer() {
    const player = this.player;
    if (!player) return;

    this.setSnapshot({
      ...this.snapshot,
      isPlaying: player.playing,
      position: player.currentTime,
      duration: player.duration || this.snapshot.duration,
      status: player.status,
    });
    this.wasInterrupted = false;
  }

  private startLoadingTimeout(requestId: number) {
    this.clearLoadingTimeout();
    this.loadingTimeout = setTimeout(() => {
      if (requestId !== this.requestId || this.snapshot.status === 'readyToPlay') return;

      this.safePause();
      this.setSnapshot({
        ...this.snapshot,
        isPlaying: false,
        status: 'error',
        error: this.snapshot.currentTrack?.fileUri.startsWith('http')
          ? 'This video did not become ready within 8 seconds.'
          : 'This local file did not become ready within 8 seconds.',
        timedOut: true,
      });
    }, 8_000);
  }

  private clearLoadingTimeout() {
    if (!this.loadingTimeout) return;
    clearTimeout(this.loadingTimeout);
    this.loadingTimeout = null;
  }

  private sourceFromTrack(track: GlobalVideoTrack): VideoSource {
    const uri = this.normalizePlaybackUri(track.fileUri);
    const headers = this.flatHeaders(mergeYoutubePlaybackHeaders(uri, track.headers));
    const contentType = track.contentType ?? (/\.m3u8($|[?#])/i.test(uri) ? 'hls' : 'progressive');

    const source: VideoSource = {
      uri,
      // The caller tells us when a remote URL is HLS/DASH; otherwise downloaded files are progressive.
      // Avoiding auto sniffing is important because local MP4/MP3 startup was taking the slow path.
      contentType,
      metadata: {
        title: track.title,
        artist: track.author,
        artwork: track.thumbnail,
      },
    };

    if (headers) {
      source.headers = headers;
    }

    return source;
  }

  private flatHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return undefined;
    const entries = Object.entries(headers).filter(
      (entry): entry is [string, string] => !!entry[0] && typeof entry[1] === 'string' && entry[1].length > 0
    );
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  private normalizePlaybackUri(uri: string) {
    if (
      uri.startsWith('http://') ||
      uri.startsWith('https://') ||
      uri.startsWith('file://') ||
      uri.startsWith('content://') ||
      uri.startsWith('asset://')
    ) {
      return uri;
    }

    // Android's Media3 backend expects downloaded files to be addressed as file:// URIs.
    // Some recovered legacy rows can contain absolute paths, so normalize them at the
    // singleton boundary before the one reusable native player receives the source.
    if (Platform.OS === 'android' && uri.startsWith('/')) {
      return `file://${uri}`;
    }

    return uri;
  }

  private safePause() {
    try {
      this.player?.pause();
    } catch {}
  }

  private setSnapshot(snapshot: GlobalVideoSnapshot) {
    // React subscribers must only be notified for real state changes; otherwise store-to-manager
    // bridges like MiniPlayer can enter a pause/update render loop.
    if (
      this.snapshot.currentTrack === snapshot.currentTrack &&
      this.snapshot.isPlaying === snapshot.isPlaying &&
      this.snapshot.position === snapshot.position &&
      this.snapshot.duration === snapshot.duration &&
      this.snapshot.status === snapshot.status &&
      this.snapshot.error === snapshot.error &&
      this.snapshot.timedOut === snapshot.timedOut
    ) {
      return;
    }
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export const globalVideoManager = GlobalVideoManager.getInstance();
export default GlobalVideoManager;
