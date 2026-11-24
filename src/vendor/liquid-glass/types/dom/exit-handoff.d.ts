/** Once a replacement starts entering, its sibling no longer owns the
 * submenu slot. Finish the old return before painting the new glass. */
export declare function finishRetainedExit(parent: Element): void;
/** A submenu's newest outgoing sibling keeps its return animation. Older
 * exits have already been superseded: finish them before another panel
 * starts returning, rather than accumulating overlapping optical layers. */
export declare function retainLatestExit(parent: Element, complete: () => void): () => void;
