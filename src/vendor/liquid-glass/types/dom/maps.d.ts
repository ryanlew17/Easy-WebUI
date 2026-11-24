import type { MapGeometry } from "../gpu/geometry.js";
import type { MapPlane } from "./map-image.js";
export interface MaterialMaps {
    /** Displacement in red and green, shape coverage in alpha. */
    field: string;
    /** Rim shade with the highlight over it. */
    overlay: string;
    duration: number;
    /** Capsule maps reused at any width: CSS cap width, plane height, and slices. */
    capsule?: {
        cap: number;
        height: number;
        planes: Record<MapPlane, [string, string, string]>;
    };
}
export declare function getMaterialMaps(g: MapGeometry): Promise<MaterialMaps>;
/** Internal surface path; public map requests still return the exact geometry.
 * Shapes an animation merely passes through are not worth keeping across
 * loads: with `persist` false they are rendered at once and never wait on the
 * store, whose startup read can take longer than the animation. */
export declare function getSurfaceMaterialMaps(g: MapGeometry, persist?: boolean): Promise<MaterialMaps>;
/** Maps for a surface available without waiting a task: already shown, or
 * stored from an earlier load. Stored maps are handed out before their images
 * are decoded; a filter image resolves a `data:` URL in the frame it is
 * referenced, and decoding continues in the background for later swaps. */
export declare function peekSurfaceMaterialMaps(g: MapGeometry): MaterialMaps | undefined;
export declare function peekMaterialMaps(g: MapGeometry): MaterialMaps | undefined;
export declare function decode(url: string): Promise<void>;
/** Record that maps were drawn, so eviction never releases images on screen. */
export declare function touchMaps(maps: MaterialMaps): void;
export declare function clearMaterialMapCache(): void;
