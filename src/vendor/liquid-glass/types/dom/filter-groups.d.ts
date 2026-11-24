import type { FilterBounds } from "./filter-bounds.js";
interface LensBox {
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Displacement images are opaque through their two-pixel border. Their
 * padded boxes must not overlap, even when the visible glass does not. */
export declare function mapBoxesOverlap(a: LensBox, b: LensBox): boolean;
export interface BranchRegions {
    output: FilterBounds;
    crop: FilterBounds;
    sampled: FilterBounds;
}
/** Group compatible, independent surfaces only when sharing their material
 * reduces the pixels processed by its primitives. Map images keep their
 * original area; merging four planes adds four passes over the union box.
 * This keeps distant small lenses from creating a scene-sized software pass.
 * Callers separately check the extra branches against WebKit's outset budget. */
export declare function clusterFilterBranches<T>(members: readonly T[], regions: (member: T) => BranchRegions, stages: {
    output: number;
    sampled: number;
}): T[][];
export {};
