import type { GlassRadius } from "../core/shape.js";
import type { Box, MorphGeometry } from "../core/morph-path.js";
import type { GlassMotion, SurfaceAnimator } from "./interaction.js";
export { radiusPixels } from "../core/morph-path.js";
/** A shape an animation passes through, for its maps to be prepared ahead. */
export type LensWaypoint = MorphGeometry;
/** A prepared shape drawn in a box: stretched to the live outline, or fixed
 * where a traced union or an absorbed glass lies. */
export interface LensPlacement extends Box {
    shape: LensWaypoint;
}
/** One frame of an animated outline. */
export interface LensFrame extends Box {
    /** Pixels, or a capsule whose ends stay exact at every width. */
    radius: number | "capsule";
    /** The material to draw: the two prepared shapes around this frame,
     * blended by `mix`. Absent while nothing should be drawn yet. */
    draw?: {
        a: LensPlacement;
        b?: LensPlacement;
        mix: number;
    };
    /** Glass this frame draws in its place, and how much of it. */
    absorbs?: {
        element: Element;
        weight: number;
    };
}
export interface GeometryAnimator extends SurfaceAnimator {
    /** The animated outline, or undefined when the surface rests at its layout box. */
    geometry(): LensFrame | undefined;
    /** Source of a joined detachment, retained while the popup rests open. */
    detachedSource(): Element | undefined;
    /** Shapes along the current animation's path. A new array starts a new path. */
    waypoints(): readonly LensWaypoint[];
    /** Material opacity while materializing or leaving a non-glass source. */
    opacity(): number;
    /** Waiting for the maps of its path before moving. */
    pending(): boolean;
    /** Initial popup placement has not settled enough to request its maps. */
    positioning(): boolean;
}
/** How a surface relates to the glass it grows out of. */
export type GlassMorph = "become" | "detach";
export interface GeometryMotionOptions {
    /** Grow out of this element on entry and shrink back into it on exit. */
    from?: () => Element | null | undefined;
    /** `become`: the source's glass is this surface, and withdraws its own
     * content while the surface is present. `detach`: this surface leaves the
     * source's glass as a drop, joined by a liquid neck until they part.
     * Default: a glass source is become; a source inside glass is detached from. */
    morph?: GlassMorph;
    /** Spring between layout boxes when the surface moves or resizes within its parent. */
    layout?: boolean;
    radius: GlassRadius;
    motion: () => GlassMotion;
    /** Whether a shape's maps are ready to draw. An entrance waits briefly for its path. */
    prepared?: (shape: LensWaypoint) => boolean;
    /** How far a detaching drop stays joined to its glass by a liquid neck, in
     * pixels. `0` lets it grow as a plain shape, with no union to trace. */
    neck?: number;
    /** Grow out of the source when attached. `false` only runs the exit back
     * into it, for an element that was already in place. Default: true. */
    enter?: boolean;
    /** Submenus fade in place and share the previous sibling's outline. */
    submenu?: boolean;
}
/** Keep the current panel while Base UI waits to open a hovered sibling. */
export declare function prepareSubmenuHandoff(trigger: HTMLElement): () => void;
/** Animate a surface's optical outline independently of its layout box.
 * Entry grows the glass out of a source shape along a planned path; Base UI
 * `data-ending-style` runs the same path back before the popup unmounts, so
 * an exit needs no new maps. Each frame names the two prepared shapes around
 * it, which the scene blends, so the material never jumps between maps.
 * Layout changes spring along a path from the previous outline. Content is
 * clipped by the outline, so the glass opens to reveal it rather than
 * scaling it. */
export declare function attachGeometryMotion(element: HTMLElement, options: GeometryMotionOptions): GeometryAnimator;
