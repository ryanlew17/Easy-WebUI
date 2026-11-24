import type { MaterialMaps } from "./maps.js";
/** First-use grace shared by map admission and scene animation readiness. */
export declare const mapWarmup = 50;
/** Chromium draws a newly referenced filter image blank until it has been
 * loaded and decoded for painting, which reads as the glass blinking when an
 * animation switches maps. A warmer paints every new map once, through its
 * own filter on a 1 × 1, nearly transparent element, as soon as the map is
 * prepared, so the image is ready by the time a surface switches to it. */
export declare function createMapWarmer(root: HTMLElement): {
    warm(maps: MaterialMaps): void;
    /** Whether these maps completed a preparation attempt and its grace
     * period. Browser filter painting itself has no completion signal. */
    has(maps: MaterialMaps): boolean;
    /** Whether a node is part of the warmer's own markup. */
    owns(node: Node): boolean;
    dispose(): void;
};
