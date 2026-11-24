/** Material maps persisted across page loads. A reload then draws its glass
 * from the store in the first frames, before the GPU device has even been
 * requested. Entries are keyed by geometry and the renderer version, so a
 * shader or encoder change never shows stale maps. Lookups and writes are
 * batched per task into one transaction each. */
export interface StoredMaps {
    planes: string[][];
    duration: number;
}
export declare function preloadStoredMaps(prefix: string): Promise<void>;
/** Maps stored for `key`, or undefined when absent or storage is unavailable. */
export declare function loadStoredMaps(key: string): Promise<StoredMaps | undefined>;
/** Keys present in the preloaded store, for decoding ahead of first use. */
export declare function preloadedKeys(): string[];
/** Maps available without waiting: the first-paint set, then the preloaded store. */
export declare function peekStoredMaps(key: string): StoredMaps | undefined;
/** Remember that `key` was needed early in this session, so the next load
 * finds it synchronously. Writes happen once things have settled. */
export declare function claimFirstPaint(key: string, maps: StoredMaps): void;
/** Persist freshly encoded maps. Writes are deferred so they never share a
 * frame with the animation that produced them. */
export declare function saveStoredMaps(key: string, maps: StoredMaps): void;
