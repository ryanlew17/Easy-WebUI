import type { GlassMotion, SurfaceAnimator } from "./interaction.js";
/** A selection lens for a tab list: it springs between tabs, follows a drag
 * across the list with velocity stretch, and selects the tab beneath it on release. Selection itself stays with the tabs: the lens
 * only clicks the tab it lands on, so keyboard and state handling are unchanged. */
export declare function attachSelectionLens(indicator: HTMLElement, motion: () => GlassMotion): SurfaceAnimator;
