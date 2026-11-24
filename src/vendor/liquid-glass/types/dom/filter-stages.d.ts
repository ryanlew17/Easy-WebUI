/** Count this library's generated SVG primitives, excluding their child
 * transfer functions and merge inputs. Gecko's operation cap counts the
 * descriptions before expanding merge inputs into GPU operations. */
export declare function filterPrimitiveCount(markup: string): number;
export { gecko } from "./engine.js";
