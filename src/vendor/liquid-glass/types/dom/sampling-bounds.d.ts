import type { FilterBounds } from "./filter-bounds.js";
/** Source pixels a displacement map can read, including its image border.
 * `box` is the positioned feImage rectangle, including the two-pixel map
 * border. Only a symmetric Lisse field may opt into the inward bound;
 * arbitrary outlines and outward (negative) refraction keep full reach. */
export declare function refractionSamplingBounds(box: FilterBounds, amount: number, symmetric?: boolean): FilterBounds;
/** Combine independently proven sampling regions. Arithmetic map blends
 * can quantize premultiplied channels at low alpha; callers must use full
 * reach for such blends unless their opaque coverage is known to coincide. */
export declare function unionSamplingBounds(boxes: readonly FilterBounds[]): FilterBounds;
