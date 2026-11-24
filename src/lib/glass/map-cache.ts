// @req REQ-2026-006：resolved 与 in-flight 地图共享同一个像素硬上限。
interface CacheEntry<T> {
  pixels: number;
  value: T;
}

function validPixels(pixels: number): void {
  if (!Number.isFinite(pixels) || pixels < 0) throw new TypeError('Map pixels must be finite and nonnegative.');
}

export class PixelMapCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly pending = new Map<string, number>();
  private resolvedPixels = 0;
  private pendingPixels = 0;

  constructor(
    readonly maxPixels: number,
    private readonly onEvict?: (key: string, value: T) => void,
  ) {
    if (!Number.isFinite(maxPixels) || maxPixels <= 0) throw new RangeError('Map pixel budget must be positive.');
  }

  get totalPixels(): number {
    return this.resolvedPixels + this.pendingPixels;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  reserve(key: string, pixels: number): void {
    validPixels(pixels);
    if (pixels > this.maxPixels) throw new RangeError('Map exceeds the pixel budget.');
    if (this.pending.has(key)) throw new Error('Map reservation already exists.');
    this.delete(key);
    this.pending.set(key, pixels);
    this.pendingPixels += pixels;
    if (this.pendingPixels > this.maxPixels) {
      this.abort(key);
      throw new RangeError('Pending maps exceed the pixel budget.');
    }
    this.evictToBudget();
  }

  put(key: string, entry: CacheEntry<T>): void {
    validPixels(entry.pixels);
    if (entry.pixels > this.maxPixels) {
      this.abort(key);
      throw new RangeError('Map exceeds the pixel budget.');
    }
    const reserved = this.pending.get(key);
    if (reserved !== undefined) {
      this.pending.delete(key);
      this.pendingPixels -= reserved;
    }
    this.delete(key);
    this.entries.set(key, entry);
    this.resolvedPixels += entry.pixels;
    this.evictToBudget();
  }

  abort(key: string): void {
    const pixels = this.pending.get(key);
    if (pixels === undefined) return;
    this.pending.delete(key);
    this.pendingPixels -= pixels;
  }

  delete(key: string): void {
    this.abort(key);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.resolvedPixels -= entry.pixels;
    this.onEvict?.(key, entry.value);
  }

  clear(): void {
    for (const [key, entry] of this.entries) this.onEvict?.(key, entry.value);
    this.entries.clear();
    this.pending.clear();
    this.resolvedPixels = 0;
    this.pendingPixels = 0;
  }

  private evictToBudget(): void {
    while (this.totalPixels > this.maxPixels && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
    if (this.totalPixels > this.maxPixels) {
      throw new RangeError('Pending maps exceed the pixel budget.');
    }
  }
}
