import type { MaterialRenderer } from "../gpu/index.js";
/** The GPU renderer, and vgpu with it, load on first use rather than with the
 * page, so an app's initial bundle carries neither. */
export declare function getMaterialRenderer(): Promise<MaterialRenderer>;
