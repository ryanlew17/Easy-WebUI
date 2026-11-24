/** Perceptual spring duration in
 * seconds and bounce from 0 (critically damped) to just under 1. */
export interface SpringOptions {
    duration: number;
    bounce: number;
}
/** Named springs shared by every glass interaction, so motion reads as one material. */
export declare const springs: {
    /** The material catching a finger or pointer. */
    readonly press: {
        readonly duration: 0.24;
        readonly bounce: 0.2;
    };
    /** Letting go: gel-like overshoot back to rest. */
    readonly release: {
        readonly duration: 0.5;
        readonly bounce: 0.42;
    };
    /** Light settling into and out of the material. */
    readonly glow: {
        readonly duration: 0.42;
        readonly bounce: 0;
    };
    /** Glass growing out of, or back into, another shape. */
    readonly morph: {
        readonly duration: 0.42;
        readonly bounce: 0.18;
    };
    /** A surface flowing to a new layout. */
    readonly layout: {
        readonly duration: 0.4;
        readonly bounce: 0.16;
    };
    /** A selection lens following a drag. */
    readonly track: {
        readonly duration: 0.18;
        readonly bounce: 0;
    };
};
/** One damped harmonic oscillator. Retargeting keeps the current velocity, so
 * every animation built on it can be interrupted and reversed mid-flight. */
export declare class Spring {
    value: number;
    velocity: number;
    target: number;
    private stiffness;
    private damping;
    constructor(value: number, options: SpringOptions);
    configure({ duration, bounce }: SpringOptions): this;
    /** Move to `value` immediately and stop. */
    jump(value: number): this;
    get settled(): boolean;
    /** Advance by `dt` seconds with the closed-form solution; large frames stay stable. */
    step(dt: number): this;
}
/** Seconds until a spring released from `from` toward `to` with `velocity`
 * comes to rest, or stays within `precision` (a fraction of the travel). */
export declare function settleTime(options: SpringOptions, from: number, to: number, velocity?: number, precision?: number): number;
/** iOS-style rubber band: follows a short drag, then resists without a hard stop. */
export declare function rubberBand(offset: number, limit: number, coefficient?: number): number;
