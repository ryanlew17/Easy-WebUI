import type { GlassRadius } from "./shape.js";
export type GlassMaterial = "clear" | "regular";
export type GlassAppearance = "light" | "dark";
export interface MaterialOptions {
    material?: GlassMaterial;
    appearance?: GlassAppearance;
    radius?: GlassRadius;
    /** Follow the nearest shape container; radius controls independent corners. */
    concentric?: boolean | {
        inset?: number;
    };
    refraction?: number;
    /** Optional six-digit hex color, e.g. "#007aff". Omit for untinted glass. */
    tint?: string;
}
export declare const materials: {
    readonly clear: {
        readonly blur: 0;
        readonly refraction: 60;
        readonly light: {
            readonly shadowLift: 0.18;
            readonly highlightRolloff: 0;
        };
        readonly dark: {
            readonly shadowLift: 0.15;
            readonly highlightRolloff: 0.2;
        };
    };
    readonly regular: {
        readonly blur: 7.33;
        readonly refraction: 60;
        readonly light: {
            readonly fillSigma: 23;
            readonly fillOpacity: 0.34;
            readonly tone: readonly [0.36, 0.67, -0.1113, 1.1031];
        };
        readonly dark: {
            readonly fillSigma: 21.8;
            readonly fillOpacity: 0.65;
            readonly tone: readonly [0.105, 0.83, -0.2091, 1.0648];
        };
    };
};
