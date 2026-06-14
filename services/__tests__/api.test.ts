/**
 * Smoke tests for pure helpers exported from services/api.ts.
 * Network-dependent functions are intentionally NOT tested here; they require
 * mocking axios + fetch and are better covered by integration tests.
 */
import {
  formatDuration,
  formatViewCount,
  getBestThumbnail,
  getFallbackFeed,
} from '@/services/api';

describe('formatDuration', () => {
  it('formats sub-hour durations as M:SS', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(599)).toBe('9:59');
  });

  it('formats hour-or-greater durations as H:MM:SS', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(36000)).toBe('10:00:00');
  });
});

describe('formatViewCount', () => {
  it('returns "0" for nullish input', () => {
    expect(formatViewCount(null)).toBe('0');
    expect(formatViewCount(undefined)).toBe('0');
  });

  it('returns the raw number under 1000', () => {
    expect(formatViewCount(0)).toBe('0');
    expect(formatViewCount(999)).toBe('999');
  });

  it('abbreviates thousands, millions, billions', () => {
    expect(formatViewCount(1_500)).toBe('1.5K');
    expect(formatViewCount(2_300_000)).toBe('2.3M');
    expect(formatViewCount(7_800_000_000)).toBe('7.8B');
  });
});

describe('getBestThumbnail', () => {
  it('prefers maxresdefault when present', () => {
    const url = getBestThumbnail([
      { url: 'https://x/default.jpg', quality: 'default' },
      { url: 'https://x/maxres.jpg', quality: 'maxresdefault' },
      { url: 'https://x/sd.jpg', quality: 'sddefault' },
    ]);
    expect(url).toBe('https://x/maxres.jpg');
  });

  it('falls back to the largest by area when no preferred quality matches', () => {
    const url = getBestThumbnail([
      { url: 'https://x/small.jpg', quality: 'unknown', width: 100, height: 100 },
      { url: 'https://x/big.jpg', quality: 'unknown', width: 1280, height: 720 },
    ]);
    expect(url).toBe('https://x/big.jpg');
  });

  it('normalizes protocol-relative URLs to https', () => {
    const url = getBestThumbnail([{ url: '//i.ytimg.com/x.jpg', quality: 'high' }]);
    expect(url).toBe('https://i.ytimg.com/x.jpg');
  });

  it('returns an empty string when no thumbnails are provided', () => {
    expect(getBestThumbnail([])).toBe('');
  });
});

describe('getFallbackFeed', () => {
  it('returns a non-empty array of fallback videos', () => {
    const feed = getFallbackFeed();
    expect(Array.isArray(feed)).toBe(true);
    expect(feed.length).toBeGreaterThan(0);
    for (const video of feed) {
      expect(typeof video.videoId).toBe('string');
      expect(typeof video.title).toBe('string');
    }
  });

  it('returns a music-specific subset for the music category', () => {
    const all = getFallbackFeed('all');
    const music = getFallbackFeed('music');
    expect(music.length).toBeLessThanOrEqual(all.length);
  });
});
