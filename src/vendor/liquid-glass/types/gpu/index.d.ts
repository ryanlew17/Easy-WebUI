import type { Gpu, ShaderSource } from "../../deps/vgpu.js";
export { mapPlanes } from "./planes.js";
import type { MapGeometry } from "./geometry.js";
export { mapScale } from "./geometry.js";
export type { MapGeometry } from "./geometry.js";
export interface MapPixels {
    width: number;
    height: number;
    pixels: Uint8Array;
    duration: number;
}
/** One GPU device, one compiled pipeline. Requests made in the same task are
 * rendered together: every shape of a batch is one band of an atlas, drawn
 * in one pass and read back once, so an animation path costs one roundtrip. */
export declare class MaterialRenderer {
    private readonly gpu;
    private readonly shader;
    private readonly ready;
    private readonly slots;
    private queue;
    private flushing;
    /** Resolves once the device has completed its first submission. A fresh
     * device's first work is held back while the page keeps painting, so the
     * renderer warms itself up as soon as it exists rather than during a
     * surface's first animation. */
    readonly warmed: Promise<void>;
    constructor(gpu: Gpu);
    render(geometry: MapGeometry): Promise<MapPixels>;
    private flush;
    private slot;
    private draw;
    dispose(): void;
}
export declare function getMaterialRenderer(): Promise<MaterialRenderer>;
export declare function disposeMaterialRenderer(): Promise<void>;
export declare const materialShader: ShaderSource;
