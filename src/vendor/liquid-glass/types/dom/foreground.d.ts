import type { MaterialOptions } from "../core/materials.js";
import type { MaterialMaps } from "./maps.js";
export interface ForegroundLens {
    element: HTMLElement;
    x: number;
    y: number;
    w: number;
    h: number;
    opacity: number;
    options: MaterialOptions;
    maps?: MaterialMaps;
}
/** Compare sibling stacking branches before falling back to document order. */
export declare function comparePaintOrder(a: HTMLElement, b: HTMLElement): number;
export declare function overlaps(a: Pick<ForegroundLens, "x" | "y" | "w" | "h">, b: Pick<ForegroundLens, "x" | "y" | "w" | "h">): boolean;
/** Filter live foreground DOM through higher lenses, without repainting their rims.
 * Transparent input must stay transparent: unlike the backdrop pass, no edge
 * extension or opaque material fill belongs in this foreground contribution.
 */
export declare function foregroundFilter(id: string, target: ForegroundLens, overlays: readonly ForegroundLens[]): string;
