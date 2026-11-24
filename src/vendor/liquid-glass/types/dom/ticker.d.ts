/** A frame loop that runs only while something can change. Glass scenes used
 * to sample every surface on every frame for the life of the page; a ticker
 * wakes on the signals that precede a geometry change (input, scroll,
 * resize, DOM mutation, CSS transitions and animations) and sleeps once a few
 * consecutive frames found nothing to do. A slow heartbeat catches movement
 * no signal announces.
 *
 * Every ticker of a window shares one animation frame, split into a read
 * phase and a write phase: each step measures and returns the writes it
 * wants, and the writes run once every step has measured. A page of many
 * scenes then forces layout at most once per frame instead of once per scene. */
export interface Ticker {
    /** Run on the next frame, if not already scheduled. */
    wake(): void;
    /** Wake when this element's size changes. */
    observe(element: Element): void;
    unobserve(element: Element): void;
    dispose(): void;
}
export interface TickerOptions {
    /** Where mutations, input, and animation events are listened for. */
    root: Node;
    /** Mutations in these nodes are the ticker's own output and never wake it. */
    ignore?: (target: Node) => boolean;
    /** Called for mutations that are not ignored, before the next frame. */
    onMutation?: () => void;
    /** Milliseconds between heartbeats while idle. */
    heartbeat?: number;
}
/** What a step found: whether it needs the next frame, and the writes to
 * apply after every ticker has measured. A bare boolean is "active". */
export type StepResult = boolean | {
    active: boolean;
    write?: () => void;
};
export declare function createTicker(step: (now: number) => StepResult, options: TickerOptions): Ticker;
