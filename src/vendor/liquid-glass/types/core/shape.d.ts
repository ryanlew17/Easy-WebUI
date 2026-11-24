import type { SmoothCornerOptions } from "../../deps/lisse.js";
/** A fixed continuous corner, a continuous capsule, or a circular cap. */
export type GlassRadius = number | "capsule" | "circle";
export declare function cornerOptions(radius: GlassRadius): SmoothCornerOptions;
export declare function shapePath(width: number, height: number, radius: GlassRadius): string;
export declare function shapeClip(width: number, height: number, radius: GlassRadius): string;
type Point = [number, number];
/** Tessellate Lisse's SVG path for the WGSL distance field. This is the same
 * outline used by the DOM, not a second corner formula. Uniform shapes are
 * symmetric, so the GPU only needs the top-right quadrant. */
export declare function shapePolygon(width: number, height: number, radius: GlassRadius): Point[];
export declare function shapeSegments(width: number, height: number, radius: GlassRadius): {
    segments: number[][];
    count: number;
};
export {};
