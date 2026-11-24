import type { FilterBounds } from "./filter-bounds.js";
export interface SparseCompositionUnit {
    /** Stable identity of this material unit. */
    id: string;
    mask: string;
    /** Material, outline and light, in their source-over paint order. */
    layers: readonly string[];
    /** Union of every member's output bounds, including outline padding. */
    bounds: FilterBounds;
}
/** Replace the source in disjoint rectangular regions. Each region keeps
 * the exact sequential alpha composition, but its intermediate buffers only
 * cover nearby surfaces. Erasing rectangles instead of derived material
 * alpha avoids rewalking the optical graph when WebKit computes outsets. */
export declare function composeSparseLayers(units: readonly SparseCompositionUnit[], result?: string, source?: string): string;
