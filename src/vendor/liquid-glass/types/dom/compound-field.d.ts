import type { MaterialOptions } from "../core/materials.js";
import type { FilterBounds } from "./filter-bounds.js";
import type { MapPlane } from "./map-image.js";
interface FieldSurface {
    element: Element;
    options: MaterialOptions;
    maps?: unknown;
    x: number;
    y: number;
    w: number;
    h: number;
    opacity: number;
    baseOpacity?: number;
}
interface FieldContext<T> {
    source(surface: T): Element | undefined;
    nested(surface: T): boolean;
    refraction(surface: T): number;
    reach(surface: T): number;
}
export declare const fieldTouches: (a: Pick<FieldSurface, "x" | "y" | "w" | "h">, b: Pick<FieldSurface, "x" | "y" | "w" | "h">, reach?: number) => boolean;
/** A detached popup and its source can share one optical field when they
 * have the same opaque material. Moving the source to the popup's paint
 * position must not change any intervening surface's sampled backdrop. */
export declare function compoundSources<T extends FieldSurface>(ordered: readonly T[], context: FieldContext<T>): Map<T, T>;
interface FieldMember {
    serial: number;
    opacity: number;
    baseOpacity?: number;
}
/** Draw one plane of a compound field: the source's glass, faded as the
 * popup absorbs it, under the popup's. A field's alpha is its coverage, so
 * fading and merging fields also merges the shapes the material fills. */
export declare function compoundFieldImage<T extends FieldMember>(source: T, popup: T, plane: MapPlane, result: string, box: FilterBounds, image: (member: T, plane: MapPlane, result: string) => string): string;
export {};
