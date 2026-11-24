/** Rendering engine, which decides how SVG filters on HTML are painted:
 * Chromium on the GPU, WebKit and Gecko mostly in software. */
/** iOS browser brands can report a different vendor while still using WebKit. */
export declare function isWebKit(agent: Pick<Navigator, "vendor" | "userAgent">): boolean;
export declare const webkit: boolean;
/** Gecko caps a filter chain at 64 operations and renders graphs with images
 * or displacement in software. */
export declare const gecko: boolean;
export declare const chromium: boolean;
