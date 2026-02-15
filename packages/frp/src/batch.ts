/**
 * Internal batch context for tracking updates
 */
class BatchContext {
    private pendingHandlers: Set<() => void> = new Set();
    private active: boolean = false;
    private depth: number = 0;
    private readonly maxDepth: number = 100000;

    /**
     * Run a function in a batch, delaying notifications until the end
     */
    batch<T>(fn: () => T): T {
        // If we're already in an active batch, just increment depth and run
        if (this.active) {
            this.depth++;

            if (this.depth > this.maxDepth) {
                console.error(
                    "Maximum batch depth exceeded. Possible infinite loop.",
                );
            }

            try {
                return fn();
            } finally {
                this.depth--;
            }
        }

        // Start a new batch
        this.active = true;
        this.depth = 1;

        try {
            const result = fn();

            // Process all pending handlers using microtask to ensure we
            // complete after all synchronous code
            queueMicrotask(() => {
                // Keep flushing until no more handlers are queued
                // This handles cascading emissions during the flush
                while (this.pendingHandlers.size > 0) {
                    const handlers = Array.from(this.pendingHandlers);
                    this.pendingHandlers.clear();

                    // Run all handlers while keeping active=true so cascading emits are also batched
                    for (const handler of handlers) {
                        try {
                            handler();
                        } catch (error) {
                            console.error("Error in batched handler:", error);
                        }
                    }
                }

                // Only deactivate after all handlers complete
                this.active = false;
                this.depth = 0;
            });

            return result;
        } catch (error) {
            // Make sure we reset the state even if there's an error
            this.active = false;
            this.pendingHandlers.clear();
            this.depth = 0;
            throw error;
        }
    }

    /**
     * Schedule a handler to run at the end of the current batch,
     * or run immediately if not in a batch
     */
    scheduleUpdate(handler: () => void): void {
        if (this.active) {
            this.pendingHandlers.add(handler);
        } else {
            handler();
        }
    }

    /**
     * Check if this context is currently batching
     */
    isBatching(): boolean {
        return this.active;
    }
}

/**
 * The currently active batch context
 */
let activeContext: BatchContext | null = null;

/**
 * The default batch context used when no batch is active
 */
const defaultBatchContext = new BatchContext();

/**
 * Run a function in a batch
 * @param fn The function to run in batch
 */
export function batch<T>(fn: () => T): T {
    // Save the previous context to restore later
    const previousContext = activeContext;

    // Use a new context for this batch
    const batchContext = new BatchContext();
    activeContext = batchContext;

    try {
        const result = batchContext.batch(fn);
        // Schedule context restoration after the microtask flushes
        queueMicrotask(() => {
            if (activeContext === batchContext) {
                activeContext = previousContext;
            }
        });
        return result;
    } catch (error) {
        // On error, restore immediately
        activeContext = previousContext;
        throw error;
    }
}

/**
 * Schedule a handler to run at the end of the current batch
 */
export function scheduleUpdate(handler: () => void): void {
    // Use either the active context or the default one
    const context = activeContext || defaultBatchContext;
    context.scheduleUpdate(handler);
}

/**
 * Check if we're currently in a batch operation
 */
export function isBatching(): boolean {
    return activeContext !== null && activeContext.isBatching();
}