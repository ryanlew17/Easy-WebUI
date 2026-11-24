import type { ShapePoint } from "../core/concentric.js";
import type { GlassRadius } from "../core/shape.js";
/** Wake the shared loop, for callers that learn of a container change first. */
export declare function wakeShapeLayout(element?: Element): void;
export declare function shapeContainerAttributes(radius: GlassRadius): {
    "data-lg-container": string;
    "data-lg-container-radius": string;
};
/** Declare geometry for DOM consumers without clipping or changing layout. */
export declare function registerShapeContainer(element: HTMLElement, radius: GlassRadius): () => void;
export declare function setResolvedShape(element: HTMLElement, points?: ShapePoint[]): void;
export interface ConcentricOptions {
    /** Gap from the container outline. Defaults to the smallest measured edge inset. */
    inset?: number;
    /** Radius for portions of the child away from the container boundary. */
    radius?: GlassRadius;
    /** Keep a centered text/icon band inside the inherited curve. */
    contentPadding?: number;
}
export declare function observeConcentricShape(element: HTMLElement, options?: ConcentricOptions, container?: () => HTMLElement | null): () => void;
export type GlassCornerPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface CornerOptions {
    corner?: GlassCornerPosition;
    gap?: number;
    radius?: GlassRadius;
}
export declare function observeCornerPlacement(element: HTMLElement, options?: CornerOptions, container?: () => HTMLElement | null): () => void;
/** Resolve a glass surface contour once per geometry change, including nested containers. */
export declare function createConcentricResolver(element: HTMLElement, inset: number | undefined, radius: GlassRadius): () => ShapePoint[] | undefined;
