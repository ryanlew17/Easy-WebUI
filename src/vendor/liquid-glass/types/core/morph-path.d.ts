import type { ShapePoint } from "./concentric.js";
import type { GlassRadius } from "./shape.js";
/** A box in any shared coordinate space. */
export interface Box {
    left: number;
    top: number;
    width: number;
    height: number;
}
/** A rounded box: the outline of glass in motion. */
export interface MorphShape extends Box {
    radius: number;
}
/** A shape whose maps can be prepared: dimensions, corners, and an optional
 * traced outline in the shape's own box. */
export interface MorphGeometry {
    width: number;
    height: number;
    radius: GlassRadius;
    outline?: ShapePoint[];
    /** Map density. Resting shapes match their surface exactly; shapes passed
     * through in motion use one pixel per CSS pixel. */
    dpr?: number;
    /** A resting shape, whose maps are worth keeping across loads. */
    resting?: boolean;
}
export declare const mix: (a: number, b: number, t: number) => number;
export declare function smoothstep(edge0: number, edge1: number, x: number): number;
/** Pixel radius of a declared glass shape at a given size. */
export declare function radiusPixels(radius: GlassRadius | string | null | undefined, width: number, height: number): number;
/** How far apart two shapes are: relative size, then corners. */
export declare function shapeDistance(a: {
    width: number;
    height: number;
    radius: GlassRadius;
}, b: {
    width: number;
    height: number;
    radius: GlassRadius;
}): number;
/** Gap between two boxes, or zero when they overlap. */
export declare const boxGap: (a: Box, b: Box) => number;
/** Where glass grows from and where it grows to. */
export interface MorphEndpoints {
    from: Box;
    fromRadius: GlassRadius;
    to: Box;
    toRadius: GlassRadius;
    /** The axis the surface opens along leads the growth; the other follows.
     * Undefined: both axes move together, as for a layout change. */
    along?: "x" | "y";
}
/** The axis along which `to` lies beyond `from`: the direction a popup opens. */
export declare function openingAxis(from: Box, to: Box): "x" | "y";
/** The outline at progress `p` along the path: it leaves its source with
 * fully rounded, drop-like corners, stretches along the opening axis before
 * it widens, and only takes its final corners once it has nearly arrived. */
export declare function morphShape(e: MorphEndpoints, p: number): MorphShape;
/** Visibility of a popup's content: it appears once the glass has room. */
export declare const contentReveal: (p: number) => number;
/** How far the source's own content has withdrawn into the glass that left it. */
export declare const sourceConceal: (p: number) => number;
/** How far apart a drop and its glass can be and still flow together; the
 * neck thins as the drop reaches its place, so it pinches off and rests as
 * its own shape even right beside its source. */
export declare const neckWidth: (p: number, neck: number) => number;
/** One prepared shape on the path. */
export interface MorphStop {
    p: number;
    shape: MorphGeometry;
    /** Drawn in this box rather than stretched to the live outline: a traced
     * union, or the glass a drop is still inside. */
    box?: Box;
    /** Draws the source glass as part of itself. */
    absorbs: boolean;
}
export interface MorphPlanOptions {
    /** Shapes prepared between the endpoints. */
    stops?: number;
    /** Union samples while a drop is joined to its glass. */
    unions?: number;
    /** Neck reach in pixels. */
    neck?: number;
    /** Map density of the shapes in motion. */
    dpr?: number;
    /** Map density of the resting endpoints. */
    restDpr?: number;
}
/** The glass a drop detaches from. `width` and `height` are its layout size
 * and `radius` its declared corners, so its stop matches its own resting map. */
export interface MorphGlass extends Box {
    radius: GlassRadius;
    layoutWidth: number;
    layoutHeight: number;
}
/** Plan the shapes an animation passes through, so their maps can be
 * prepared together before it starts. Stops are spaced evenly by how much
 * the shape changes between them; the endpoints are exact. A drop leaving
 * glass adds the traced unions of the two while they are joined, beginning
 * with the glass's own shape while the drop is still inside it. */
export declare function planMorph(e: MorphEndpoints, glass: MorphGlass | undefined, options?: MorphPlanOptions): MorphStop[];
/** What to draw at progress `p`: the two stops around it and their blend,
 * plus how much of the source glass the frame draws in its place. */
export interface MorphDraw {
    a: MorphStop;
    b?: MorphStop;
    mix: number;
    absorb: number;
}
export declare function morphDraw(stops: readonly MorphStop[], p: number): MorphDraw | undefined;
