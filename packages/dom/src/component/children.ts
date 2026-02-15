import type { Reactive } from "@synx/frp/reactive";
import { sample } from "@synx/frp/reactive";
import { subscribe } from "../../../frp/src/event";
import { withDelegationRoot } from "../tags";

type CreatedChild = Node | [Node, () => void];

export function children<T>(
    list: Reactive<T[]>,
    create: (item: T, index: number) => CreatedChild,
): (parent: HTMLElement) => () => void;

export function children<T>(
    list: Reactive<T[]>,
    config: {
        create: (item: T, index: number) => CreatedChild;
        update?: (node: Node, item: T, index: number) => void;
        shouldUpdate?: (prev: T, next: T) => boolean;
        key?: (item: T) => string | number;
    },
): (parent: HTMLElement) => () => void;

export function children<T>(
    list: Reactive<T[]>,
    arg:
        | ((item: T, index: number) => CreatedChild)
        | {
              create: (item: T, index: number) => CreatedChild;
              update?: (node: Node, item: T, index: number) => void;
              shouldUpdate?: (prev: T, next: T) => boolean;
              key?: (item: T) => string | number;
          },
) {
    return (parent: HTMLElement) => {
        const config = typeof arg === "function" ? { create: arg } : arg;

        return applyChildren(parent, {
            each: list,
            create: config.create,
            update: config.update,
            shouldUpdate: config.shouldUpdate,
            key: config.key,
        });
    };
}


export function applyChildren<T>(
    parent: HTMLElement,
    config: {
        each: Reactive<T[]>;
        create: (item: T, index: number) => CreatedChild;
        update?: (node: Node, item: T, index: number) => void;
        shouldUpdate?: (prev: T, next: T) => boolean;
        key?: (item: T) => string | number;
    },
) {
    let items: T[] = [],
        nodes: Node[] = [],
        disposers: (() => void)[] = [],
        len = 0;

    const { each, create, update } = config;

    const handleUpdate = (newItems: T[]) => {
        const newLen = newItems.length;

        if (newLen === 0) {
            handleEmpty(parent, items, nodes, disposers);
            items = [];
            nodes = [];
            disposers = [];
            len = 0;
            return;
        }

        if (len === 0) {
            ({ items, nodes, disposers } = mountInitial(
                parent,
                newItems,
                create,
            ));
            len = newLen;
            return;
        }

        const result = reconcile(
            parent,
            items,
            nodes,
            disposers,
            newItems,
            create,
            update,
            config.shouldUpdate,
            config.key,
        );

        items = result.items;
        nodes = result.nodes;
        disposers = result.disposers;
        len = result.len;
    };

    // Handle initial value
    handleUpdate(sample(each));

    // Subscribe to changes (direct subscription without batching)
    const stop = subscribe(each.changes, handleUpdate);

    return () => {
        handleEmpty(parent, items, nodes, disposers);
        items = [];
        nodes = [];
        disposers = [];
        len = 0;
        stop();
    };
}

function handleEmpty<T>(
    parent: HTMLElement,
    items: T[],
    nodes: Node[],
    disposers: (() => void)[],
) {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].parentNode === parent) {
            parent.removeChild(nodes[i]);
        }
        safeDispose(disposers[i]);
    }
}

function mountInitial<T>(
    parent: HTMLElement,
    newItems: T[],
    create: (item: T, index: number) => CreatedChild,
): {
    items: T[];
    nodes: Node[];
    disposers: (() => void)[];
} {
    const len = newItems.length;
    const items = [...newItems];

    // Pre-allocate arrays for better performance
    const nodes: Node[] = new Array(len);
    const disposers: (() => void)[] = new Array(len);

    // Use DocumentFragment for batched insertion (single reflow)
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < len; i++) {
        // Inline normalizeCreatedChild for performance
        const created = withDelegationRoot(parent, () => create(items[i], i));
        const node = Array.isArray(created) ? created[0] : created;
        const dispose = Array.isArray(created) ? created[1] : (() => {});

        fragment.appendChild(node);  // No reflow - appending to fragment
        nodes[i] = node;
        disposers[i] = dispose;
    }

    // Single appendChild = single reflow
    parent.appendChild(fragment);

    return { items, nodes, disposers };
}

function reconcile<T>(
    parent: HTMLElement,
    oldItems: T[],
    oldNodes: Node[],
    oldDisposers: (() => void)[],
    newItems: T[],
    create: (item: T, index: number) => CreatedChild,
    update?: (node: Node, item: T, index: number) => void,
    shouldUpdate?: (prev: T, next: T) => boolean,
    key?: (item: T) => string | number,
): {
    items: T[];
    nodes: Node[];
    disposers: (() => void)[];
    len: number;
} {
    const newLen = newItems.length;
    const tempNodes: Node[] = new Array(newLen);
    const tempDisposers: (() => void)[] = new Array(newLen);

    let start = 0;
    let endOld = oldItems.length - 1;
    let endNew = newLen - 1;

    // Step 1: Skip common prefix: same items in same order at start.
    while (
        start <= endOld &&
        start <= endNew &&
        getKey(oldItems[start], key) === getKey(newItems[start], key)
    ) {
        tempNodes[start] = oldNodes[start];
        tempDisposers[start] = oldDisposers[start];
        if (!shouldUpdate || shouldUpdate(oldItems[start], newItems[start])) {
            update?.(tempNodes[start], newItems[start], start);
        }
        start++;
    }

    // Step 2: Skip common suffix
    while (
        endOld >= start &&
        endNew >= start &&
        getKey(oldItems[endOld], key) === getKey(newItems[endNew], key)
    ) {
        tempNodes[endNew] = oldNodes[endOld];
        tempDisposers[endNew] = oldDisposers[endOld];
        if (!shouldUpdate || shouldUpdate(oldItems[endOld], newItems[endNew])) {
            update?.(tempNodes[endNew], newItems[endNew], endNew);
        }
        endOld--;
        endNew--;
    }

    // Exit early if nothing to diff
    if (start > endNew) {
        // Remove old items beyond new end
        for (let i = endOld; i >= start; i--) {
            if (oldNodes[i].parentNode === parent) {
                parent.removeChild(oldNodes[i]);
            }
            safeDispose(oldDisposers[i]);
        }

        return {
            items: [...newItems],
            nodes: tempNodes,
            disposers: tempDisposers,
            len: newLen,
        };
    }

    // Step 3: Keyed diffing: for mid-section reordering + node reuse.
    const newIndices = new Map<string | number | T, number>();
    const newIndicesNext: number[] = new Array(endNew + 1);
    let i: number, j: number;

    for (j = endNew; j >= start; j--) {
        const k = getKey(newItems[j], key);
        const item = newItems[j];
        const prev = newIndices.get(k);
        newIndicesNext[j] = prev === undefined ? -1 : prev;
        newIndices.set(k, j);
    }

    for (i = start; i <= endOld; i++) {
        const k = getKey(oldItems[i], key);
        const matchIndex = newIndices.get(k);

        if (matchIndex !== undefined && matchIndex !== -1) {
            tempNodes[matchIndex] = oldNodes[i];
            tempDisposers[matchIndex] = oldDisposers[i];
            if (
                !shouldUpdate ||
                shouldUpdate(oldItems[i], newItems[matchIndex])
            ) {
                update?.(
                    tempNodes[matchIndex],
                    newItems[matchIndex],
                    matchIndex,
                );
            }
            newIndices.set(k, newIndicesNext[matchIndex]);
        } else {
            if (oldNodes[i].parentNode === parent) {
                parent.removeChild(oldNodes[i]);
            }
            safeDispose(oldDisposers[i]);
        }
    }

    // Step 4: Insert new nodes and move reused one.
    let current: Node | null = parent.firstChild;
    for (j = start; j <= endNew; j++) {
        const node = tempNodes[j];
        if (!node) {
            // Inline normalizeCreatedChild for performance
            const created = withDelegationRoot(parent, () =>
                create(newItems[j], j),
            );
            const newNode = Array.isArray(created) ? created[0] : created;
            const dispose = Array.isArray(created) ? created[1] : (() => {});
            tempNodes[j] = newNode;
            tempDisposers[j] = dispose;
            parent.insertBefore(newNode, current);
        } else {
            while (current && current !== node) current = current.nextSibling;
            if (node !== current) parent.insertBefore(node, current);
            current = node.nextSibling;
        }
    }

    return {
        items: [...newItems],
        nodes: tempNodes,
        disposers: tempDisposers,
        len: newLen,
    };
}

function getKey<T>(
    item: T,
    keyFn?: (item: T) => string | number,
): T | string | number {
    return keyFn ? keyFn(item) : item;
}

function safeDispose(dispose?: () => void): void {
    if (!dispose) return;
    try {
        dispose();
    } catch (error) {
        console.error("children cleanup failed", error);
    }
}
