import type { FilterBounds } from "./filter-bounds.js";
/** WebKit filters a partial repaint of an HTML element over the dirty rect
 * grown by the element's filter outsets, then grows that region by the
 * outsets again. A primitive whose subregion misses the region yields no
 * image, which fails the whole filter, so the repainted area paints blank:
 * hovering a link far from every lens erases it. The filter must reach
 * from any point of the element to every primitive it evaluates. */
/** Outsets, in user units, that let any repaint inside a `width` × `height`
 * element reach every primitive subregion of `markup` and every `extra` box. */
export declare function repaintReach(markup: string, width: number, height: number, extra?: readonly FilterBounds[]): number;
/** Add `outsets` to the filter's last merge with transparent images that
 * only move pixels. As siblings in that merge they raise its outsets to at
 * least `outsets` instead of adding to the branches beside them.
 *
 * Offsets are cheap copies but stay within half the element, so their
 * shifted image always overlaps the region. A layer WebKit splits into tiles
 * filters each tile over the tile grown by its outsets once, which needs more
 * reach than that; `tiled` pads with blurs of a transparent flood instead,
 * whose outsets grow without moving anything. */
export declare function padRepaintReach(markup: string, outsets: number, width: number, height: number, tiled?: boolean): string;
/** A tile grows its own rectangle by the outsets once rather than twice,
 * so it needs about twice the outsets of a whole-layer repaint. */
export declare const tiledReach = 2;
