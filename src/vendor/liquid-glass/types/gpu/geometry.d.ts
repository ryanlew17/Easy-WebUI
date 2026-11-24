import type { GlassRadius } from "../core/shape.js";
import type { ShapePoint } from "../core/concentric.js";
export interface MapGeometry {
    /** Resolved convex outline for container-relative glass, in local CSS pixels. */
    outline?: ShapePoint[];
    width: number;
    height: number;
    radius: GlassRadius;
    dpr?: number;
    appearance?: "light" | "dark";
}
export declare const maxAtlasRows = 8192;
/** Pixels per CSS pixel a map is rendered at. Maps are stretched to their
 * surface when drawn, so a surface too large for the atlas at the display's
 * ratio, such as a full-height panel on a 2x or 3x display, renders at a
 * lower ratio instead of failing. */
export declare function mapScale(g: MapGeometry): number;
