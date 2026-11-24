import { describe, expect, it } from 'vitest';
import { PixelMapCache } from '../src/lib/glass/map-cache';

// @req REQ-2026-006：地图缓存使用像素而非条目数作为硬上限。
describe('@req REQ-2026-006 pixel map cache', () => {
  it('evicts least-recently-used entries to stay within the pixel budget', () => {
    const cache = new PixelMapCache<string>(1_000);
    cache.put('a', { pixels: 500, value: 'a' });
    cache.put('b', { pixels: 400, value: 'b' });
    expect(cache.get('a')).toBe('a');
    cache.put('c', { pixels: 500, value: 'c' });
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('a');
    expect(cache.totalPixels).toBe(1_000);
  });

  it('rejects an oversized entry and invalid pixel costs', () => {
    const cache = new PixelMapCache<string>(1_000);
    expect(() => cache.put('large', { pixels: 1_001, value: 'x' })).toThrow(RangeError);
    expect(() => cache.put('bad', { pixels: Number.NaN, value: 'x' })).toThrow(TypeError);
    expect(cache.totalPixels).toBe(0);
  });

  it('shares the same budget between pending and resolved maps', () => {
    const cache = new PixelMapCache<string>(1_000);
    cache.reserve('pending', 700);
    cache.put('old', { pixels: 400, value: 'old' });
    expect(cache.get('old')).toBeUndefined();
    expect(cache.totalPixels).toBe(700);
    cache.put('pending', { pixels: 700, value: 'ready' });
    expect(cache.totalPixels).toBe(700);
    expect(cache.get('pending')).toBe('ready');
  });

  it('rolls back a reservation that cannot fit the shared budget', () => {
    const cache = new PixelMapCache<string>(1_000);
    cache.reserve('pending-a', 800);
    expect(() => cache.reserve('pending-b', 500)).toThrow(RangeError);
    expect(cache.totalPixels).toBe(800);
    cache.abort('pending-a');
    expect(cache.totalPixels).toBe(0);
  });

  it('notifies evictions so decoded resources can be released', () => {
    const evicted: Array<[string, string]> = [];
    const cache = new PixelMapCache<string>(100, (key, value) => { evicted.push([key, value]); });
    cache.put('a', { pixels: 60, value: 'a' });
    cache.put('b', { pixels: 60, value: 'b' });
    expect(evicted).toEqual([['a', 'a']]);
    cache.clear();
    expect(evicted).toEqual([['a', 'a'], ['b', 'b']]);
  });

  it('releases reservations and clears idempotently', () => {
    const cache = new PixelMapCache<string>(1_000);
    cache.reserve('pending', 200);
    cache.abort('pending');
    cache.put('a', { pixels: 300, value: 'a' });
    cache.delete('a');
    cache.clear();
    cache.clear();
    expect(cache.totalPixels).toBe(0);
    expect(cache.size).toBe(0);
  });
});
