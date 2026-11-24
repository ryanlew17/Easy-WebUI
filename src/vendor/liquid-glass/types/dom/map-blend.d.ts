import type { MapPlane } from "./map-image.js";
import type { MaterialMaps } from "./maps.js";
export interface PlacedMap {
    maps: MaterialMaps;
    x: number;
    y: number;
    w: number;
    h: number;
}
/** Emit an animation's material map, retaining both inputs unless they name
 * the same pixels at the same position. This cuts redundant Gecko filter
 * operations during map preparation and at the end of a spring. */
export declare function blendMapImage(plane: MapPlane, result: string, placement: {
    a: PlacedMap;
    b: PlacedMap;
    mix: number;
}, bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
}, collapseIdentical?: boolean): string;
