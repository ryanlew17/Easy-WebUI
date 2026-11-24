/** Whether pinch magnification is active. WebKit repaints a magnified page
 * whole, but fails tiles at a magnified element's edge whose filter region
 * reaches far past it, so repaint padding must stay off while magnified. */
export declare function magnified(): boolean;
/** Device pixels per CSS pixel that WebKit filters render at: pinch
 * magnification enlarges the page's tiles but not its filter buffers. */
export declare function filterPixelRatio(): number;
/** WebKit splits a composited layer into tiles once its size, outsets
 * included, times pinch magnification passes 2048 points (1280, or 1024 under
 * memory pressure, on iOS). Each tile then filters its own region, and tiles
 * fail where that region misses the filter's primitives. Largest outsets, in
 * CSS pixels, that keep a `width` × `height` element in one layer. */
export declare function untiledOutsets(width: number, height: number, margin?: number): number;
/** The factor WebKit's page zoom applies to filter user space; 1 elsewhere. */
export declare function pageZoom(): number;
/** Scale the user-space lengths of every primitive, leaving the filter's
 * own bounding-box region alone. */
export declare function zoomFilterMarkup(markup: string, zoom: number): string;
