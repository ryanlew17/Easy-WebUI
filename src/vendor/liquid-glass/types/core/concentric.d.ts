import type { GlassRadius } from "./shape.js";
export type ShapePoint = [number, number];
export interface ShapeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ShapeGeometry {
    width: number;
    height: number;
    radius: GlassRadius;
    outline?: ShapePoint[];
}
/** Inward parallel offset of the convex Lisse outline, in CSS pixels. */
export declare function insetShape(shape: ShapeGeometry, inset: number): ShapePoint[];
/** Child-local outline: keep its own corners away from the container edge,
 * and inherit the container's parallel curve wherever the two meet. */
export declare function concentricOutline(parent: ShapePoint[], bounds: ShapeBounds, radius?: GlassRadius): ShapePoint[];
export declare function polygonClip(points: ShapePoint[]): string;
/** Equal-edge inset that fits an entire fixed-size control inside a corner. */
export declare function cornerPlacement(shape: ShapeGeometry, width: number, height: number, gap: number, radius?: GlassRadius): number;
/** Horizontal clearance for a centered content band inside a clipped row. */
export declare function contentInsets(points: ShapePoint[], width: number, height: number, bandHeight: number): {
    left: number;
    right: number;
};
/** Uniform storage for an asymmetric convex contour used by the GPU field. */
export declare function outlineSegments(points: ShapePoint[]): {
    segments: number[][];
    count: number;
};
