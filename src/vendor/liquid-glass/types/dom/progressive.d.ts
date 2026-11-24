import type { GlassBlurEdge, PhysicalEdge, ProgressiveBlurOptions } from "../core/progressive.js";
export type GlassScrollTarget = HTMLElement | (() => HTMLElement | null);
export interface ScrollEdgesOptions extends Omit<ProgressiveBlurOptions, "edge"> {
    /** Scrollport to blur. Only this element is filtered; siblings stay sharp. */
    target: GlassScrollTarget;
    edges?: readonly GlassBlurEdge[];
}
interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type FilterEngine = "chromium" | "webkit" | "gecko";
export interface ProgressiveRegion extends Box {
    edge: PhysicalEdge;
    blur: number;
    refraction: number;
}
/** A flood over the edge half of a region, blurred along the depth with
 * σ = depth / 6, rises as Φ(6u − 3) across it. These tables map that ramp
 * to each level's weight. Floods, blurs, transfers and composites are the
 * primitives Gecko renders on the GPU; an image anywhere in the graph sends
 * the whole element to its software fallback. */
export declare const rampTables: string[];
export declare function maskUrl(token: string): string | undefined;
/** One filter graph that keeps the sharp source and blurs only near edges. */
export declare function progressiveGraph(id: string, regions: ProgressiveRegion[], width: number, height: number, target?: FilterEngine): string;
export declare function createProgressiveLayer(root: HTMLElement, onError: (error: Error) => void, viewportMode?: boolean): {
    add(element: HTMLElement, options?: ProgressiveBlurOptions): () => void;
    addScroll(options: ScrollEdgesOptions): () => void;
    count(): number;
    /** Regions blurred directly on the scene's own target, as of the last update. */
    regions(): readonly ProgressiveRegion[];
    operations(): number;
    outsets(): number;
    scrollsContent(): boolean;
    error(): Error | undefined;
    update(content: HTMLElement | null): string;
    dispose(): void;
};
export {};
