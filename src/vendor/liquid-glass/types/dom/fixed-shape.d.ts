import type { GlassRadius } from "../core/shape.js";
/** Apply Lisse geometry without taking ownership of component data-slot/data-state. */
export declare function observeFixedShape(element: HTMLElement, radius: GlassRadius): () => void;
