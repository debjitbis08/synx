import { describe, test, expect } from "vitest";
import { Future } from "./future";

function createTimeoutFuture<T>(value: T, delay = 100): Future<T> {
    return new Future<T>((subscriber) => {
        setTimeout(() => {
            subscriber(value);
        }, delay);
        return () => {};
    });
}

describe("Future", () => {
    describe("Future Functor Laws", () => {
        test("Identity: task.map(x => x) is equivalent to task", () => {
            const task = createTimeoutFuture(42);

            const identityMappedFuture = task.map(x => x);

            let originalValue: number | null = null;
            let mappedValue: number | null = null;

            task.run(value => {
                originalValue = value;
            });

            identityMappedFuture.run(value => {
                mappedValue = value;
            });

            expect(mappedValue).toBe(originalValue);
        });

        test("Composition: task.map(f).map(g) is equivalent to task.map(x => g(f(x)))", () => {
            const task = createTimeoutFuture(3);

            const f = (x: number) => x + 1;
            const g = (x: number) => x * 2;

            const composedFuture = task.map(f).map(g);
            const directMappedFuture = task.map(x => g(f(x)));

            let composedValue: number | null = null;
            let directMappedValue: number | null = null;

            composedFuture.run(value => {
                composedValue = value;
            });

            directMappedFuture.run(value => {
                directMappedValue = value;
            });

            expect(composedValue).toBe(directMappedValue);
        });
    });

    describe("Future Monad Laws", () => {
        test("Left Identity: Future.of(x).chain(f) is equivalent to f(x)", () => {
            const x = 5;
            const f = (n: number) => createTimeoutFuture(n * 2);

            const leftSide = Future.of(x).chain(f);
            const rightSide = f(x);

            let leftValue: number | null = null;
            let rightValue: number | null = null;

            leftSide.run(value => {
                leftValue = value;
            });

            rightSide.run(value => {
                rightValue = value;
            });

            expect(leftValue).toBe(rightValue);
        });

        test("Right Identity: task.chain(Future.of) is equivalent to task", () => {
            const task = createTimeoutFuture(7);

            const chainedFuture = task.chain(Future.of);

            let originalValue: number | null = null;
            let chainedValue: number | null = null;

            task.run(value => {
                originalValue = value;
            });

            chainedFuture.run(value => {
                chainedValue = value;
            });
            expect(chainedValue).toBe(originalValue);
        });

        test("Associativity: task.chain(f).chain(g) is equivalent to task.chain(x => f(x).chain(g))", () => {
            const task = createTimeoutFuture(2);

            const f = (n: number) => createTimeoutFuture(n + 3);
            const g = (n: number) => createTimeoutFuture(n * 4);

            const leftSide = task.chain(f).chain(g);
            const rightSide = task.chain(x => f(x).chain(g));

            let leftValue: number | null = null;
            let rightValue: number | null = null;

            leftSide.run(value => {
                leftValue = value;
            });

            rightSide.run(value => {
                rightValue = value;
            });

            expect(leftValue).toBe(rightValue);
        });
    });

});