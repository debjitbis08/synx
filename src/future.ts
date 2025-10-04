import type { InternalReactive } from "./reactive";
import * as R from "./reactive"

// Future represents a computation that will be applied to subscribers
export class Future<A> {
    // The computation function
    computation: (handler: (value: A) => void) => () => void;

    /**
     * Create a new Future with the given computation
     */
    constructor(computation: (handler: (value: A) => void) => () => void) {
        this.computation = computation;
    }

    /**
     * Run this future with a specific handler
     */
    run(handler: (value: A) => void): () => void {
        return this.computation(handler);
    }

    /**
     * Map a function over this future
     */
    map<B>(f: (a: A) => B): Future<B> {
        return new Future<B>((handler) =>
            this.computation((a) => {
                try {
                    handler(f(a));
                } catch (error) {
                    console.error("Error in map function:", error);
                }
            }),
        );
    }

    chain<B>(f: (a: A) => Future<B>): Future<B> {
        return new Future<B>((handler) => {
            // Track inner subscription to be able to clean it up
            let innerUnsubscribe: (() => void) | null = null;

            // Subscribe to this future
            const outerUnsubscribe = this.computation((a) => {
                try {
                    // Clean up previous inner subscription if it exists
                    if (innerUnsubscribe) {
                        innerUnsubscribe();
                        innerUnsubscribe = null;
                    }

                    // Create new inner future using the received value
                    const innerFuture = f(a);

                    // Subscribe to the inner future
                    innerUnsubscribe = innerFuture.run(handler);
                } catch (error) {
                    console.error("Error in chain function:", error);
                }
            });

            // Return a function that cleans up both subscriptions
            return () => {
                outerUnsubscribe();
                if (innerUnsubscribe) {
                    innerUnsubscribe();
                }
            };
        });
    }

    static of<A>(value: A): Future<A> {
        return new Future<A>((handler) => {
            // Immediately call the handler with the value
            handler(value);
            // Return a no-op cleanup function
            return () => {
                /* no-op */
            };
        });
    }

    /**
     * Create a never future that doesn't produce values
     */
    static never<A>(): Future<A> {
        return new Future<A>(() => () => {
            /* no-op */
        });
    }

    /**
     * Create a future from a reactive value's changes (Only for internal use by Reactive and Event)
     * @internal
     */
    static fromReactive<A>(reactive: InternalReactive<A>): Future<A> {
        return new Future<A>((handler) => {
            return reactive.subscribeInternal(handler, false);
        });
    }

    static reactive<A>(initialValue: Future<A>): Future<InternalReactive<A>> {
        return initialValue.map((v: A) => {
            return new R.ReactiveImpl<A>(v);
        });
    }
}