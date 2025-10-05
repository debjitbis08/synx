import { effect, Reactive } from "@synx/frp/reactive";

export function children<T>(
    list: Reactive<T[]>,
    create: (item: T, index: number) => Node,
): (parent: HTMLElement) => () => void;

export function children<T>(
    list: Reactive<T[]>,
    config: {
        create: (item: T, index: number) => Node;
        update?: (node: Node, item: T, index: number) => void;
        shouldUpdate?: (prev: T, next: T) => boolean;
        key?: (item: T) => string | number;
    },
): (parent: HTMLElement) => () => void;

export function children<T>(
    list: Reactive<T[]>,
    arg:
        | ((item: T, index: number) => Node)
        | {
              create: (item: T, index: number) => Node;
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
        create: (item: T, index: number) => Node;
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

    return effect(each, (newItems) => {
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
    });
}

function handleEmpty<T>(
    parent: HTMLElement,
    items: T[],
    nodes: Node[],
    disposers: (() => void)[],
) {
    for (let i = 0; i < nodes.length; i++) {
        parent.removeChild(nodes[i]);
        disposers[i]?.(); // cleanup if any
    }
}

function mountInitial<T>(
    parent: HTMLElement,
    newItems: T[],
    create: (item: T, index: number) => Node,
): {
    items: T[];
    nodes: Node[];
    disposers: (() => void)[];
} {
    const items = [...newItems];
    const nodes: Node[] = [];
    const disposers: (() => void)[] = [];

    for (let i = 0; i < items.length; i++) {
        const node = create(items[i], i);
        parent.appendChild(node);
        nodes[i] = node;
        disposers[i] = () => {}; // placeholder — useful if we add cleanup support
    }

    return { items, nodes, disposers };
}

function reconcile<T>(
    parent: HTMLElement,
    oldItems: T[],
    oldNodes: Node[],
    oldDisposers: (() => void)[],
    newItems: T[],
    create: (item: T, index: number) => Node,
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
            parent.removeChild(oldNodes[i]);
            oldDisposers[i]?.();
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
            parent.removeChild(oldNodes[i]);
            oldDisposers[i]?.();
        }
    }

    // Step 4: Insert new nodes and move reused one.
    let current: Node | null = parent.firstChild;
    for (j = start; j <= endNew; j++) {
        const node = tempNodes[j];
        if (!node) {
            const newNode = create(newItems[j], j);
            tempNodes[j] = newNode;
            tempDisposers[j] = () => {};
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
