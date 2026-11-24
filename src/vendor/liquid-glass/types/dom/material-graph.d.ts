import type { MaterialOptions } from "../core/materials.js";
/** Regular glass refracts a frosted copy of its backdrop: a blur lightened
 * (darkened in dark appearance) by a wider fill blur. */
export declare function frostMarkup(p: string, input: string, o: MaterialOptions, soften?: number): {
    markup: string;
    result: string;
};
/** The material's tone curve applied to `${p}refracted`, written to `${p}color`. */
export declare function toneMarkup(p: string, o: MaterialOptions, nested: boolean): string;
/** Tint as linear RGB channels, when it is a hex color. */
export declare function tintChannels(o: MaterialOptions): number[] | undefined;
/** Colored glass transmits luminance, rather than mixing neutral backdrop RGB
 * into a weak overlay. A pale backdrop can brighten the pigment without
 * removing its chroma; dark detail stays visible. Reads `${p}color`. */
export declare function tintMarkup(p: string, o: MaterialOptions, tint: number[]): {
    markup: string;
    color: string;
};
/** The overlay's light is white (0.82 in dark appearance) over a black rim.
 * Scaling its color recolors the light alone and keeps the coverage the WGSL
 * renderer computed. */
export declare function overlayTintMarkup(input: string, result: string, o: MaterialOptions, tint: number[]): string;
