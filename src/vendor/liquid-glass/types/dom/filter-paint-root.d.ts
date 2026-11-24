/** Keep WebKit's CSS reference filter in its target's own paint coordinates.
 * Acquire before applying the filter, and release when that filter is removed.
 * A shared target can be claimed by both scene and foreground filtering.
 */
export declare function acquireFilterPaintRoot(element: HTMLElement): () => void;
/** Keep popup mounting from changing the scene's composited backing in WebKit.
 * Opacity preserves the containing block of fixed-position descendants.
 */
export declare function acquireSceneCompositingLayer(element: HTMLElement): () => void;
