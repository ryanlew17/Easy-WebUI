/** Encode GPU readback pixels, never DOM content. The atlas holds its planes
 * stacked vertically. Each plane yields its full image followed, for capsule
 * maps, by its left, middle, and right slices. Everything runs on the CPU of
 * whichever thread calls it. */
export declare function encodeMapPixels(pixels: Uint8Array, width: number, height: number, cap?: number): Promise<string[][]>;
