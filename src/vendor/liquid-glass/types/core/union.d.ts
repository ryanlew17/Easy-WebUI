import type { ShapePoint } from "./concentric.js";
/** An axis-aligned rounded rectangle in any shared coordinate space. */
export interface RoundRect {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
}
/** Signed distance to a rounded rectangle: negative inside. */
export declare function roundRectDistance(px: number, py: number, r: RoundRect): number;
/** Polynomial smooth minimum: shapes closer than `k` flow into each other. */
export declare function smoothMin(a: number, b: number, k: number): number;
/** Twice the signed area; positive for the clockwise-on-screen winding the
 * renderer expects (top edge left to right, with y pointing down). */
export declare function windingArea(points: readonly ShapePoint[]): number;
/** Outlines of the smooth union of rounded rectangles, traced with marching
 * squares at `step` pixels. Returns one loop per connected body, wound the way
 * the renderer expects and simplified to at most `limit` edges each. */
export declare function smoothUnion(shapes: readonly RoundRect[], k: number, step?: number, limit?: number): ShapePoint[][];
