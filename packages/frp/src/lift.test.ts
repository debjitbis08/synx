import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lift, lift1, lift2, lift3 } from "./lift";
import * as R from "./reactive";
import type { Reactive } from "./reactive";
import * as E from "./event";

describe("lift functions", () => {
    // Clean up any reactive subscriptions after each test
    const cleanupReactives: Reactive<any>[] = [];

    beforeEach(() => {
        cleanupReactives.length = 0;
    });

    afterEach(() => {
        cleanupReactives.forEach((r) => R.cleanup(r));
    });

    // Helper to track reactives for cleanup
    function trackReactive<T>(r: Reactive<T>): Reactive<T> {
        cleanupReactives.push(r);
        return r;
    }

    type LiftedBinary<A, B, R> = {
        (a: A, b: B): R;
        (a: Reactive<A>, b: B): Reactive<R>;
        (a: A, b: Reactive<B>): Reactive<R>;
        (a: Reactive<A>, b: Reactive<B>): Reactive<R>;
    };
    describe("lift", () => {
        it("works with non-reactive arguments", () => {
            const add = (a: number, b: number) => a + b;
            const liftedAdd = lift(add) as LiftedBinary<number, number, number>;

            const result = liftedAdd(5, 10);
            expect(result).toBe(15);
        });

        it("works with one reactive argument", () => {
            const add = (a: number, b: number) => a + b;
            const liftedAdd = lift(add) as LiftedBinary<number, number, number>;

            const reactiveA = trackReactive(R.of(5));
            const result = liftedAdd(reactiveA, 10);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(15);
        });

        it("works with multiple reactive arguments", () => {
            const add = (a: number, b: number) => a + b;
            const liftedAdd = lift(add) as LiftedBinary<number, number, number>;

            const reactiveA = trackReactive(R.of(5));
            const reactiveB = trackReactive(R.of(10));
            const result = liftedAdd(reactiveA, reactiveB);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(15);
        });

        it("updates result when reactive values change", () => {
            const add = (a: number, b: number) => a + b;
            const liftedAdd = lift2(add);

            const [evA ,emitA]= E.create<number>();
            const [evB,emitB] = E.create<number>();

            // Create reactive values with the ability to update them
            const reactiveA = R.create(5, evA);
            const reactiveB = R.create(10, evB);

            const result = liftedAdd(reactiveA, reactiveB) as Reactive<number>;

            expect(R.get(result)).toBe(15);

            // Update first reactive value
            emitA(7)
            expect(R.get(reactiveA)).toBe(7);
            expect(R.get(reactiveB)).toBe(10);
            expect(R.get(result)).toBe(17);

            // Update second reactive value
            emitB(13);
            expect(R.get(reactiveA)).toBe(7);
            expect(R.get(reactiveB)).toBe(13);
            expect(R.get(result)).toBe(20);
        });

        it("works with complex functions and objects", () => {
            type Person = { name: string; age: number };
            const formatPerson = (person: Person, prefix: string) =>
                `${prefix} ${person.name} (${person.age})`;

            const liftedFormat = lift(formatPerson) as LiftedBinary<Person, string, string>;

            const person = trackReactive(R.of({ name: "Alice", age: 30 }));
            const prefix = trackReactive(R.of("Ms."));

            const result = liftedFormat(person, prefix);
            expect(R.get(result as Reactive<string>)).toBe("Ms. Alice (30)");

            // Update reactive person
            (person as any).updateValueInternal({ name: "Alice", age: 31 });
            expect(R.get(result as Reactive<string>)).toBe("Ms. Alice (31)");

            // Update reactive prefix
            (prefix as any).updateValueInternal("Dr.");
            expect(R.get(result as Reactive<string>)).toBe("Dr. Alice (31)");
        });

        it("handles functions with many arguments", () => {
            const sum = (a: number, b: number, c: number, d: number) =>
                a + b + c + d;
            const liftedSum = lift(sum) as ((a: number | Reactive<number>, b: number | Reactive<number>, c: number | Reactive<number>, d: number | Reactive<number>) => number | Reactive<number>);

            const a = trackReactive(R.of(1));
            const b = trackReactive(R.of(2));
            const c = trackReactive(R.of(3));

            const result = liftedSum(a, b, c, 4);
            expect(R.get(result as Reactive<number>)).toBe(10);

            (c as any).updateValueInternal(5);
            expect(R.get(result as Reactive<number>)).toBe(12);
        });

        it("properly cleans up subscriptions", () => {
            const add = (a: number, b: number) => a + b;
            const liftedAdd = lift(add) as LiftedBinary<number, number, number>;

            const reactiveA = trackReactive(R.create(5));
            const reactiveB = trackReactive(R.create(10));

            const result = liftedAdd(reactiveA, reactiveB) as Reactive<number>;

            // Mock the cleanup method to check if it's called
            const cleanupSpy = vi.fn();
            (result as any).cleanupFns.add(cleanupSpy);

            R.cleanup(result);
            expect(cleanupSpy).toHaveBeenCalled();
        });
    });

    describe("lift1", () => {
        it("works with non-reactive argument", () => {
            const double = (x: number) => x * 2;
            const liftedDouble = lift1(double);

            const result = liftedDouble(5);
            expect(result).toBe(10);
        });

        it("works with reactive argument", () => {
            const double = (x: number) => x * 2;
            const liftedDouble = lift1(double);

            const reactiveX = trackReactive(R.of(5));
            const result = liftedDouble(reactiveX);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(10);
        });

        it("updates result when reactive value changes", () => {
            const double = (x: number) => x * 2;
            const liftedDouble = lift1(double);

            const reactiveX = trackReactive(R.create(5));
            const result = liftedDouble(reactiveX) as Reactive<number>;
            trackReactive(result);

            expect(R.get(result)).toBe(10);

            (reactiveX as any).updateValueInternal(7);
            expect(R.get(result)).toBe(14);
        });
    });

    describe("lift2/liftBinary", () => {
        it("works with non-reactive arguments", () => {
            const multiply = (a: number, b: number) => a * b;
            const liftedMultiply = lift2(multiply);

            const result = liftedMultiply(5, 3);
            expect(result).toBe(15);
        });

        it("works with first argument reactive", () => {
            const multiply = (a: number, b: number) => a * b;
            const liftedMultiply = lift2(multiply);

            const reactiveA = trackReactive(R.of(5));
            const result = liftedMultiply(reactiveA, 3);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(15);
        });

        it("works with second argument reactive", () => {
            const multiply = (a: number, b: number) => a * b;
            const liftedMultiply = lift2(multiply);

            const reactiveB = trackReactive(R.of(3));
            const result = liftedMultiply(5, reactiveB);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(15);
        });

        it("works with both arguments reactive", () => {
            const multiply = (a: number, b: number) => a * b;
            const liftedMultiply = lift2(multiply);

            const reactiveA = trackReactive(R.of(5));
            const reactiveB = trackReactive(R.of(3));
            const result = liftedMultiply(reactiveA, reactiveB);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<number>)).toBe(15);
        });

        it("updates result when reactive values change", () => {
            const multiply = (a: number, b: number) => a * b;
            const liftedMultiply = lift2(multiply);

            const reactiveA = trackReactive(R.create(5));
            const reactiveB = trackReactive(R.create(3));

            const result = liftedMultiply(
                reactiveA,
                reactiveB,
            ) as Reactive<number>;
            trackReactive(result);

            expect(R.get(result)).toBe(15);

            (reactiveA as any).updateValueInternal(7);
            expect(R.get(result)).toBe(21);

            (reactiveB as any).updateValueInternal(4);
            expect(R.get(result)).toBe(28);
        });
    });

    describe("lift3", () => {
        it("works with non-reactive arguments", () => {
            const combineStrings = (a: string, b: string, c: string) =>
                `${a}-${b}-${c}`;
            const liftedCombine = lift3(combineStrings);

            const result = liftedCombine("a", "b", "c");
            expect(result).toBe("a-b-c");
        });

        it("works with mixed reactive and non-reactive arguments", () => {
            const combineStrings = (a: string, b: string, c: string) =>
                `${a}-${b}-${c}`;
            const liftedCombine = lift3(combineStrings);

            const reactiveA = trackReactive(R.of("a"));
            const reactiveC = trackReactive(R.of("c"));

            const result = liftedCombine(reactiveA, "b", reactiveC);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<string>)).toBe("a-b-c");
        });

        it("works with all reactive arguments", () => {
            const combineStrings = (a: string, b: string, c: string) =>
                `${a}-${b}-${c}`;
            const liftedCombine = lift3(combineStrings);

            const reactiveA = trackReactive(R.of("a"));
            const reactiveB = trackReactive(R.of("b"));
            const reactiveC = trackReactive(R.of("c"));

            const result = liftedCombine(reactiveA, reactiveB, reactiveC);

            expect(R.isReactive(result)).toBe(true);
            expect(R.get(result as Reactive<string>)).toBe("a-b-c");
        });

        it("updates result when any reactive value changes", () => {
            const combineStrings = (a: string, b: string, c: string) =>
                `${a}-${b}-${c}`;
            const liftedCombine = lift3(combineStrings);

            const reactiveA = trackReactive(R.create("a"));
            const reactiveB = trackReactive(R.create("b"));
            const reactiveC = trackReactive(R.create("c"));

            const result = liftedCombine(
                reactiveA,
                reactiveB,
                reactiveC,
            ) as Reactive<string>;
            trackReactive(result);

            expect(R.get(result)).toBe("a-b-c");

            (reactiveA as any).updateValueInternal("x");
            expect(R.get(result)).toBe("x-b-c");

            (reactiveB as any).updateValueInternal("y");
            expect(R.get(result)).toBe("x-y-c");

            (reactiveC as any).updateValueInternal("z");
            expect(R.get(result)).toBe("x-y-z");
        });
    });

    // Issue: The original code uses R.addCleanup but the updated code seems to use R.onCleanup
    // it("handles error in R.onCleanup (was R.addCleanup) function", () => {
    //     // This test checks whether this code properly handles the difference
    //     // between the function in lift.ts (R.onCleanup) and what's actually
    //     // available in reactive.ts (R.addCleanup)

    //     const add = (a: number, b: number) => a + b;
    //     const liftedAdd = lift(add) as LiftedBinary<number, number, number>;

    //     const reactiveA = trackReactive(R.of(5));
    //     const reactiveB = trackReactive(R.of(10));

    //     expect(() => {
    //         const result = liftedAdd(reactiveA, reactiveB);
    //         trackReactive(result as Reactive<number>);
    //     }).not.toThrow();
    // });
});
