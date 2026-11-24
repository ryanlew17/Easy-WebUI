import type { MaterialOptions } from "../core/materials.js";
import type { FilterBounds } from "./filter-bounds.js";
interface BackdropConsumer<T> {
    key: T;
    /** Stable material-unit identity, independent of the other consumers. */
    id: string;
    options: MaterialOptions;
    bounds: FilterBounds;
    /** Additional glass layers sampled alongside SourceGraphic. */
    inputs: readonly unknown[];
}
interface BackdropMaterial {
    result: string;
    markup: string;
}
/** Regular glass reading the same unmodified backdrop can reuse its two
 * blurs and their mix. Refraction, tone, tint and coverage remain per lens. */
export declare function sharedBackdropMaterials<T>(consumers: readonly BackdropConsumer<T>[], soften: number): Map<T, BackdropMaterial>;
export {};
