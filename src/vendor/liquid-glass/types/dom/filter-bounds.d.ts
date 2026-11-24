/** Bounds of the source and every optical surface, including transformed controls. */
export interface FilterBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare function filterBounds(width: number, height: number, surfaces: readonly FilterBounds[], padding: number): FilterBounds;
export interface EdgeSides {
    left: boolean;
    top: boolean;
    right: boolean;
    bottom: boolean;
    /** Corners some region reaches past on both of its sides, indexed [x][y] as 0 or 2. */
    corners: Set<string>;
}
/** Which content edges, and which corners, a sampled region crosses. */
export declare function crossedSides(width: number, height: number, regions: readonly FilterBounds[]): EdgeSides;
/** Edge tiles that extend the live source past its sides by repeating its
 * edge pixels, like a clamp-to-edge sampler. Only the sides and corners some
 * surface samples past are produced; a scene whose glass stays inside its
 * content needs none. Each tile is a named result a surface merges into its
 * own cropped backdrop, so no full-size extended copy of the source is ever
 * built or re-evaluated. */
export declare function edgeTiles(width: number, height: number, bounds: FilterBounds, prefix: string, sides: EdgeSides, source?: string): {
    markup: string;
    names: Record<string, string>;
};
/** The tile keys a region needs: its crossed sides, and the corners of two crossed sides. */
export declare function tilesFor(width: number, height: number, r: FilterBounds): string[];
