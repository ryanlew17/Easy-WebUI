/** Encode tightly packed RGBA pixels, `stride` bytes per row, as a PNG. The
 * "Sub" filter turns the maps' smooth gradients into runs zlib packs well. */
export declare function encodePng(width: number, height: number, rgba: Uint8Array, stride?: number): Promise<Uint8Array>;
export declare function base64(bytes: Uint8Array): string;
/** A `data:` URL: Chromium resolves it synchronously for `feImage`, where a
 * `blob:` URL would leave the material blank for a frame. */
export declare function pngDataUrl(width: number, height: number, rgba: Uint8Array, stride?: number): Promise<string>;
/** An uncompressed PNG `data:` URL, available at once for tiny images. */
export declare function pngDataUrlSync(width: number, height: number, rgba: Uint8Array): string;
