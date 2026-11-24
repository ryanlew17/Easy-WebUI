/** Encode map planes (and capsule slices) to `data:` URLs on a worker, so the
 * main thread never compresses images. Without workers (including under a
 * restrictive CSP) the identical encoder runs locally. The pixels are copied
 * for the worker, so they remain available for that fallback. */
export declare function encodeMaterialPixels(pixels: Uint8Array, width: number, height: number, cap?: number): Promise<string[][]>;
