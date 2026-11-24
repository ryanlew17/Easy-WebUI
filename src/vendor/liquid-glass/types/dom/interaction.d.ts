/** `full` follows the system: reduced motion always removes elasticity. */
export type GlassMotion = "full" | "reduced" | "none";
export declare function resolveMotion(motion: GlassMotion | undefined): GlassMotion;
export interface SurfaceAnimator {
    /** Advance to `now` before the scene samples geometry. Returns true while
     * the animation is in motion and needs the next frame. While the scene is
     * `quiet`, an animator leaves the page as it is: nothing moves, so the GPU
     * is free for the maps another surface is waiting on. */
    frame(now: number, quiet?: boolean): boolean | void;
    dispose(): void;
}
/** Elastic, illuminated response to touch and pointer input: the surface grows
 * under a press, stretches toward a drag with constant volume, and settles with
 * gel-like overshoot on release. Writes only `translate`, `scale` and custom
 * properties, so consumer `transform` styles continue to compose. */
export declare function attachInteraction(element: HTMLElement, motion: () => GlassMotion): SurfaceAnimator;
