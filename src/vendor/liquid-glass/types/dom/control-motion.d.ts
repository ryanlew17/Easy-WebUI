import type { GlassMotion } from "./interaction.js";
/** Motion options for native-style value controls. */
export interface ControlMotionOptions {
    /** Override the scene's motion level. */
    motion?: GlassMotion;
    /** Lift the thumb into glass under a press. Default: true. */
    interactive?: boolean;
}
/** Advance visible thumbs before the scene samples their optical geometry.
 * Returns whether any thumb in the scene is still moving. */
export declare function updateControlMotion(root: HTMLElement, now: number): boolean;
/** Controls have their own measured geometry; generic button press scaling must not compound it. */
export declare function attachNativeControlMotion(element: HTMLElement, motion: GlassMotion, interactive: boolean): () => void;
