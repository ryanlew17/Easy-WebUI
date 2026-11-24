/** Retain filter primitives and their loaded images across geometry changes.
 * The last description also owns the attribute values, avoiding live DOM
 * collection reads and redundant writes. Exact repeats do no parsing at all. */
export declare function patchFilters(defs: Element, markup: readonly string[], resolve: (token: string) => string | undefined): (id: string) => string;
