export { isWebKit, webkit } from "./engine.js";
/** WebKit paints CSS reference filters in software and adds up the outsets of
 * every blur and displacement primitive in an element's filters: along a
 * chain of `url()` filters, and across the branches of one filter's graph,
 * whose walk folds only one level at a time and sums what it leaves behind.
 * It then clamps the whole filter buffer to 4096 × 4096 device pixels, and
 * past that clamp draws the result stretched, so glass lands away from its
 * surface. Keeping the sum of outsets inside the budget keeps the geometry
 * exact; the material only softens on scenes that would otherwise overflow. */
/** Outsets WebKit charges for one Gaussian blur of this sigma, in the blur's own pixels. */
export declare const blurOutsets: (sigma: number) => number;
/** Factor to apply to every blur sigma and displacement amount so a filtered
 * box of `width` × `height` device pixels with `outsets` device pixels of
 * accumulated outsets stays inside WebKit's buffer clamp. 1 when it already fits. */
export declare function filterBudgetFactor(width: number, height: number, outsets: number): number;
/** Largest outsets, in device pixels, a `width` × `height` device-pixel box can take before the clamp. */
export declare function outsetBudget(width: number, height: number): number;
/** Mirror WebKit's depth-first outset fold. Shared inputs are visited again
 * at each use, so counting each blur once underestimates branched graphs. */
export declare function filterGraphOutsets(markup: string, width?: number, height?: number): number;
