import type { Reactive } from "./reactive";
import * as R from "./reactive";

/**
 * Type helper for determining if a type is a Reactive
 */
type IsReactive<T> = T extends Reactive<infer U> ? true : false;

/**
 * Unwrap the type from a Reactive if it is one
 */
type UnwrapReactive<T> = T extends Reactive<infer U> ? U : T;

/**
 * Maps function arguments, replacing Reactive<T> with T
 */
type UnwrapReactiveArgs<T extends any[]> = {
    [K in keyof T]: UnwrapReactive<T[K]>;
};

/**
 * Check if at least one argument is Reactive
 */
type HasReactiveArg<T extends any[]> = {
    [K in keyof T]: IsReactive<T[K]>;
}[number] extends false
    ? false
    : true;

/**
 * Main lift function - lifts any function to work with Reactive values
 */
export function lift<A extends any[], R>(
    fn: (...args: UnwrapReactiveArgs<A>) => R,
): (...args: A) => HasReactiveArg<A> extends true ? Reactive<R> : R {
    return ((...args: A) => {
        // Check if any arguments are Reactive
        const hasReactiveArg = args.some(
            (arg) => arg !== null && R.isReactive(arg),
        );

        if (!hasReactiveArg) {
            // If no reactive arguments, just call the function directly
            return fn(...(args as unknown as UnwrapReactiveArgs<A>));
        }

        // Get current values for all arguments
        const currentValues = args.map((arg) =>
            arg !== null && R.isReactive(arg)
                ? R.get(arg as unknown as Reactive<any>)
                : arg,
        ) as UnwrapReactiveArgs<A>;

        // Create initial reactive result
        const result = fn(...currentValues);
        const resultReactive = R.of(result);

        // Set up subscriptions for each reactive argument
        const subscriptions = args
            .map((arg, index) => {
                if (arg !== null && R.isReactive(arg)) {
                    const reactive = arg as unknown as Reactive<any>;

                    return R.subscribe(reactive, (newValue) => {
                        currentValues[index] = newValue;

                        // Compute new result and update the reactive
                        const newResult = fn(
                            ...(currentValues as UnwrapReactiveArgs<A>),
                        );
                        (resultReactive as any).updateValueInternal(newResult);
                    });
                }
                return undefined;
            })
            .filter(Boolean) as Array<() => void>;

        R.onCleanup(resultReactive, () => {
            subscriptions.forEach((unsub) => unsub());
        });

        return resultReactive;
    }) as any;
}

/**
 * Lifts a unary function to work with Reactive values
 */
export function lift1<A, R>(
    fn: (a: A) => R,
): ((a: A) => R) & ((a: Reactive<A>) => Reactive<R>) {
    return ((a: A | Reactive<A>) => {
        if (a !== null && R.isReactive(a)) {
            return R.map(a as Reactive<A>, fn);
        }
        return fn(a as A);
    }) as any;
}

/**
 * Lifts a binary function to work with Reactive values
 */
export function liftBinary<A, B, R>(
    fn: (a: UnwrapReactive<A>, b: UnwrapReactive<B>) => R,
): {
    (
        a: A extends Reactive<infer U> ? U : A,
        b: B extends Reactive<infer V> ? V : B,
    ): R;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: B extends Reactive<infer V> ? V : B,
    ): Reactive<R>;
    (
        a: A extends Reactive<infer U> ? U : A,
        b: Reactive<UnwrapReactive<B>>,
    ): Reactive<R>;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: Reactive<UnwrapReactive<B>>,
    ): Reactive<R>;
} {
    return lift(fn) as any;
}

export const lift2 = liftBinary;

export function lift3<A, B, C, R>(
    fn: (a: UnwrapReactive<A>, b: UnwrapReactive<B>, c: UnwrapReactive<C>) => R,
): {
    (
        a: A extends Reactive<infer UA> ? UA : A,
        b: B extends Reactive<infer UB> ? UB : B,
        c: C extends Reactive<infer UC> ? UC : C,
    ): R;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: B extends Reactive<infer UB> ? UB : B,
        c: C extends Reactive<infer UC> ? UC : C,
    ): Reactive<R>;
    (
        a: A extends Reactive<infer UA> ? UA : A,
        b: Reactive<UnwrapReactive<B>>,
        c: C extends Reactive<infer UC> ? UC : C,
    ): Reactive<R>;
    (
        a: A extends Reactive<infer UA> ? UA : A,
        b: B extends Reactive<infer UB> ? UB : B,
        c: Reactive<UnwrapReactive<C>>,
    ): Reactive<R>;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: Reactive<UnwrapReactive<B>>,
        c: C extends Reactive<infer UC> ? UC : C,
    ): Reactive<R>;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: B extends Reactive<infer UB> ? UB : B,
        c: Reactive<UnwrapReactive<C>>,
    ): Reactive<R>;
    (
        a: A extends Reactive<infer UA> ? UA : A,
        b: Reactive<UnwrapReactive<B>>,
        c: Reactive<UnwrapReactive<C>>,
    ): Reactive<R>;
    (
        a: Reactive<UnwrapReactive<A>>,
        b: Reactive<UnwrapReactive<B>>,
        c: Reactive<UnwrapReactive<C>>,
    ): Reactive<R>;
} {
    return lift(fn) as any;
}

export function _lift2<A, B, R>(fn: (a: A, b: B) => R) {
    return (a: A | Reactive<A>, b: B | Reactive<B>) => {
        if (R.isReactive(a)) {
            if (R.isReactive(b)) {
                // Both arguments are reactive
                return R.ap(
                    b as Reactive<B>,
                    R.map(
                        a as Reactive<A>,
                        (aVal: A) => (bVal: B) => fn(aVal, bVal),
                    ),
                );
            } else {
                // Only first argument is reactive
                return R.map(a as Reactive<A>, (aVal: A) => fn(aVal, b as B));
            }
        } else if (R.isReactive(b)) {
            // Only second argument is reactive
            return R.map(b as Reactive<B>, (bVal: B) => fn(a as A, bVal));
        } else {
            // Neither argument is reactive
            return R.of(fn(a as A, b as B));
        }
    };
}

/**
 * Lifts a ternary function to work with Reactive values
 * Uses map and ap directly for better performance
 */
export function _lift3<A, B, C, R>(fn: (a: A, b: B, c: C) => R) {
    return (a: A | Reactive<A>, b: B | Reactive<B>, c: C | Reactive<C>) => {
        // Convert function to curried form for ap
        const curriedFn = (aVal: A) => (bVal: B) => (cVal: C) =>
            fn(aVal, bVal, cVal);

        if (R.isReactive(a)) {
            // Start with a reactive function that takes b and c
            const rf = R.map(a as Reactive<A>, curriedFn);

            // Apply b
            const rfb = R.isReactive(b)
                ? R.ap(b as Reactive<B>, rf)
                : R.map(rf, (f) => f(b as B));

            // Apply c
            return R.isReactive(c)
                ? R.ap(c as Reactive<C>, rfb)
                : R.map(rfb, (f) => f(c as C));
        } else {
            // Start with a non-reactive function that takes b and c
            const f = curriedFn(a as A);

            // Apply remaining arguments
            return lift2((bVal: B, cVal: C) => f(bVal)(cVal))(b, c);
        }
    };
}

/**
 * Creates an object with lifted versions of every function in an object
 */
export function liftAll<T extends Record<string, (...args: any[]) => any>>(
    obj: T,
): {
    [K in keyof T]: ReturnType<typeof lift<Parameters<T[K]>, ReturnType<T[K]>>>;
} {
    const result: any = {};

    for (const key in obj) {
        if (typeof obj[key] === "function") {
            result[key] = lift(obj[key]);
        }
    }

    return result;
}

