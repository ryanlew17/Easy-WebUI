import type { MapGeometry } from "../gpu/geometry.js";
import type { MaterialMaps } from "./maps.js";
export type MapPlane = "field" | "overlay";
/** Map resources belong to a surface, even when its material branch is
 * regrouped as another surface enters, moves nearby, or is absorbed. */
export declare const surfaceMapResult: (serial: number, plane: MapPlane) => string;
/** Beyond two heights, Lisse capsule ends are independent of its width.
 * Bake one longer capsule and reuse its ends instead of readback per frame. */
export declare function capsuleMapGeometry(g: MapGeometry): MapGeometry | undefined;
export declare function mapToken(url: string): string;
export declare function mapUrl(token: string): string | undefined;
/** Forget a released map image. */
export declare function releaseMapToken(url: string): void;
/** Place GPU pixels in SVG filter coordinates. A pressed or stretched
 * capsule keeps round ends: caps scale with its height and only the straight
 * middle stretches. No DOM rasterization. */
export declare function mapImage(maps: MaterialMaps, plane: MapPlane, result: string, x: number, y: number, width: number, height: number, unitX?: number, unitY?: number): string;
