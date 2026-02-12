import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Event, EventImpl } from "./event";
import * as E from "./event";
import type { Reactive } from "./reactive";
import * as R from "./reactive";

describe("Event", () => {
    // Helper function to create an event and trigger it with a value
    function createTestEvent<A>(): [EventImpl<A>, (value: A) => void] {
        const [event, emit] = E.create();
        return [event as EventImpl<A>, emit];
    }

    // Helper function to collect event values
    function collectValues<A>(event: Event<A>): {
        values: A[];
        unsubscribe: () => void;
    } {
        const values: A[] = [];
        const unsubscribe = E.subscribe(event, (value) => {
            values.push(value);
        });
        return { values, unsubscribe };
    }

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("Event subscription lifecycle", () => {
        it("should handle unsubscribe and resubscribe correctly", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // First subscription
            const values1: number[] = [];
            const subscription1 = E.subscribe(event, (value) => {
                values1.push(value);
            });

            // Emit some values
            emit(1);
            emit(2);

            // Verify values were received
            expect(values1).toEqual([1, 2]);

            console.log("Unsubscribe in test");
            // Unsubscribe
            subscription1();

            // Emit a value that should not be received
            emit(3);

            // Verify the unsubscribed handler didn't receive the value
            expect(values1).toEqual([1, 2]);

            console.log("Resubscribe in test");
            // Create a new subscription
            const values2: number[] = [];
            const subscription2 = E.subscribe(event, (value) => {
                values2.push(value);
            });

            // Emit more values
            emit(4);
            emit(5);

            // Verify the new subscription received the values
            expect(values2).toEqual([4, 5]);

            // Original subscription should still have only the original values
            expect(values1).toEqual([1, 2]);

            // Clean up
            subscription2();
            E.cleanup(event);
        });

        it("should handle multiple subscribe/unsubscribe cycles", () => {
            // Create an event
            const [event, emit] = createTestEvent<string>();

            // Track all values across multiple subscriptions
            const allValues: string[] = [];

            // First subscription
            const subscription1 = E.subscribe(event, (value) => {
                console.log("sub1", value);
                allValues.push(`sub1:${value}`);
            });

            emit("a");
            expect(allValues).toEqual(["sub1:a"]);

            console.log("Adding second subscription");
            // Second subscription alongside the first
            const subscription2 = E.subscribe(event, (value) => {
                console.log("sub2", value);
                allValues.push(`sub2:${value}`);
            });

            emit("b");
            expect(allValues).toEqual(["sub1:a", "sub1:b", "sub2:b"]);

            // Unsubscribe the first
            subscription1();

            emit("c");
            expect(allValues).toEqual(["sub1:a", "sub1:b", "sub2:b", "sub2:c"]);

            // Third subscription
            const subscription3 = E.subscribe(event, (value) => {
                allValues.push(`sub3:${value}`);
            });

            emit("d");
            expect(allValues).toEqual([
                "sub1:a",
                "sub1:b",
                "sub2:b",
                "sub2:c",
                "sub2:d",
                "sub3:d",
            ]);

            // Unsubscribe all
            subscription2();
            subscription3();

            emit("e");
            // No new values should be added
            expect(allValues).toEqual([
                "sub1:a",
                "sub1:b",
                "sub2:b",
                "sub2:c",
                "sub2:d",
                "sub3:d",
            ]);

            // Resubscribe one more time
            const subscription4 = E.subscribe(event, (value) => {
                allValues.push(`sub4:${value}`);
            });

            emit("f");
            expect(allValues).toEqual([
                "sub1:a",
                "sub1:b",
                "sub2:b",
                "sub2:c",
                "sub2:d",
                "sub3:d",
                "sub4:f",
            ]);

            // Clean up
            subscription4();
            E.cleanup(event);
        });

        it("should handle zip with subscribe/unsubscribe/resubscribe", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            // Create the zipped event
            const zipped = E.zip(event1, event2);

            // First subscription
            const pairs1: Array<[number, string]> = [];
            const subscription1 = E.subscribe(zipped, (pair) => {
                pairs1.push(pair);
            });

            // Emit unbalanced values
            emit1(1);
            emit1(2);

            // No pairs yet
            expect(pairs1).toEqual([]);

            // Complete some pairs
            emit2("a");
            expect(pairs1).toEqual([[1, "a"]]);

            // Unsubscribe before all values are paired
            subscription1();

            // Create a second subscription
            const pairs2: Array<[number, string]> = [];
            const subscription2 = E.subscribe(zipped, (pair) => {
                pairs2.push(pair);
            });

            // Emit new values
            emit1(3);
            emit2("b");

            // Should see the new pair
            expect(pairs2).toEqual([[3, "b"]]);

            // Emit more values to both sides
            emit1(4);
            emit1(5);
            emit2("c");
            emit2("d");

            // Should see pairs for the new values
            expect(pairs2).toEqual([
                [3, "b"],
                [4, "c"],
                [5, "d"],
            ]);

            // First subscription should remain unchanged
            expect(pairs1).toEqual([[1, "a"]]);

            // Clean up
            subscription2();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(zipped);
        });
    });

    describe("Event Functor Laws", () => {
        describe("Identity Law: map(id) === id", () => {
            it("should maintain identity when mapping with identity function", () => {
                // Create an event
                const [event, emit] = createTestEvent();

                // Apply identity function through map
                const mappedEvent = E.map(event, (x) => x);

                // Collect values from both events
                const original = collectValues(event);
                const mapped = collectValues(mappedEvent);

                // Emit some values
                emit(1);
                emit(42);
                emit(100);

                // Verify both events received the same values
                expect(mapped.values).toEqual(original.values);

                // Clean up
                original.unsubscribe();
                mapped.unsubscribe();
                E.cleanup(event);
                E.cleanup(mappedEvent);
            });
        });

        describe("Composition Law: map(f . g) === map(f) . map(g)", () => {
            it("should compose functions correctly", () => {
                // Create an event
                const [event, emit] = createTestEvent<number>();

                // Define two functions to compose
                const f = (x: number) => x * 2;
                const g = (x: number) => x + 5;
                const composed = (x: number) => f(g(x)); // (x + 5) * 2

                // Map with composed function
                const composedMap = E.map(event, composed);

                // Map with separate functions
                const separateMap = E.map(E.map(event, g), f);

                // Collect results from both approaches
                const composedResults = collectValues(composedMap);
                const separateResults = collectValues(separateMap);

                // Emit values
                emit(1); // Should result in (1 + 5) * 2 = 12
                emit(10); // Should result in (10 + 5) * 2 = 30
                emit(-3); // Should result in (-3 + 5) * 2 = 4

                // Verify both mapping approaches yield the same results
                // expect(composedResults.values).toEqual([12, 30, 4]);
                // expect(composedResults.values).toEqual(separateResults.values);
                expect(separateResults.values).toEqual([12, 30, 4]);

                // Clean up
                // composedResults.unsubscribe();
                separateResults.unsubscribe();
                E.cleanup(event);
                // E.cleanup(composedMap);
                E.cleanup(separateMap);
            });
        });

        describe("Functor behavior with different data types", () => {
            it("should correctly map string events", () => {
                const [event, emit] = createTestEvent<string>();

                const mappedEvent = E.map(event, (str) => str.toUpperCase());
                const results = collectValues(mappedEvent);

                emit("hello");
                emit("world");

                expect(results.values).toEqual(["HELLO", "WORLD"]);

                results.unsubscribe();
                E.cleanup(event);
                E.cleanup(mappedEvent);
            });

            it("should correctly map object events", () => {
                const [event, emit] = createTestEvent<{ count: number }>();

                const mappedEvent = E.map(event, (obj) => ({
                    count: obj.count + 1,
                }));
                const results = collectValues(mappedEvent);

                emit({ count: 5 });
                emit({ count: 10 });

                expect(results.values).toEqual([{ count: 6 }, { count: 11 }]);

                results.unsubscribe();
                E.cleanup(event);
                E.cleanup(mappedEvent);
            });
        });

        describe("Edge cases", () => {
            it("should handle nested mapping correctly", () => {
                const [event, emit] = createTestEvent<number>();

                const deeplyMapped = E.map(
                    E.map(
                        E.map(
                            E.map(
                                E.map(event, (x) => x + 1),
                                (x) => x * 2,
                            ),
                            (x) => x.toString(),
                        ),
                        (x) => parseInt(x),
                    ),
                    (x) => x - 1,
                );

                const results = collectValues(deeplyMapped);

                emit(5); // ((5 + 1) * 2) - 1 = 11

                expect(results.values).toEqual([11]);

                results.unsubscribe();
                E.cleanup(event);
                E.cleanup(deeplyMapped);
            });

            it("should handle null/undefined values correctly", () => {
                const [event, emit] = createTestEvent<
                    number | null | undefined
                >();

                const mappedEvent = E.map(event, (x) =>
                    x === null || x === undefined ? -1 : x * 2,
                );
                const results = collectValues(mappedEvent);

                emit(5);
                emit(null);
                emit(undefined);
                emit(10);

                expect(results.values).toEqual([10, -1, -1, 20]);

                results.unsubscribe();
                E.cleanup(event);
                E.cleanup(mappedEvent);
            });
        });

        describe("Performance considerations", () => {
            it("should not invoke mapping function unnecessarily", () => {
                const [event, emit] = createTestEvent<number>();

                const mapFn = vi.fn((x: number) => x * 2);
                const mappedEvent = E.map(event, mapFn);

                // Subscribe to mapped event
                const unsubscribe = E.subscribe(mappedEvent, () => {});

                // Emit values
                emit(1);
                emit(2);
                emit(3);

                // Function should be called exactly once per emission
                expect(mapFn).toHaveBeenCalledTimes(3);
                expect(mapFn).toHaveBeenNthCalledWith(1, 1);
                expect(mapFn).toHaveBeenNthCalledWith(2, 2);
                expect(mapFn).toHaveBeenNthCalledWith(3, 3);

                unsubscribe();
                E.cleanup(event);
                E.cleanup(mappedEvent);
            });
        });
    });

    describe("Event apply function", () => {
        it("should apply reactive function to the event", () => {
            const reactiveFn = R.of((x: number) => x * 2);
            const [event, emit] = createTestEvent<number>();

            const output = collectValues(E.apply(event, reactiveFn));

            emit(2);
            emit(3);
            emit(4);

            expect(output.values).toEqual([4, 6, 8]);
        });

        it("should apply updated function to the event", () => {
            const [event, emit] = createTestEvent<number>();
            const [multiplier, emitMultiplier] = createTestEvent<number>();

            const reactiveFn = R.map(
                E.stepper(multiplier, 2),
                (m) => (x: number) => x * m,
            );

            const output = collectValues(E.apply(event, reactiveFn));

            emit(2);
            emitMultiplier(3);
            emit(3);
            emitMultiplier(4);
            emit(4);

            expect(output.values).toEqual([4, 9, 16]);
        });
    });

    describe("Event mergeWith function", () => {
        it("should merge two number events with transform functions", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<number>();

            // Define transform functions
            const double = (x: number) => x * 2;
            const addTen = (x: number) => x + 10;

            // Merge the events with transform functions
            const mergedEvent = E.mergeWith(event1, event2, double, addTen);
            const results = collectValues(mergedEvent);

            // Emit values from both events
            emit1(5); // Should result in 5 * 2 = 10
            emit2(7); // Should result in 7 + 10 = 17
            emit1(3); // Should result in 3 * 2 = 6
            emit2(2); // Should result in 2 + 10 = 12

            // Verify the merged event received the transformed values
            expect(results.values).toEqual([10, 17, 6, 12]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(mergedEvent);
        });

        it("should merge string and number events to a common type", () => {
            // Create events of different types
            const [strEvent, emitStr] = createTestEvent<string>();
            const [numEvent, emitNum] = createTestEvent<number>();

            // Define transform functions that convert to a common type (string)
            const passthrough = (s: string) => s;
            const numToStr = (n: number) => n.toString();

            // Merge the events
            const mergedEvent = E.mergeWith(
                strEvent,
                numEvent,
                passthrough,
                numToStr,
            );
            const results = collectValues(mergedEvent);

            // Emit values from both events
            emitStr("hello");
            emitNum(42);
            emitStr("world");
            emitNum(100);

            // Verify the merged event received the transformed values
            expect(results.values).toEqual(["hello", "42", "world", "100"]);

            // Clean up
            results.unsubscribe();
            E.cleanup(strEvent);
            E.cleanup(numEvent);
            E.cleanup(mergedEvent);
        });

        it("should handle complex transformations with mergeWith", () => {
            // Create events
            const [objEvent, emitObj] = createTestEvent<{
                type: string;
                value: number;
            }>();
            const [numEvent, emitNum] = createTestEvent<number>();

            // Define transform functions that extract and format data
            const formatObj = (obj: { type: string; value: number }) =>
                `${obj.type}: ${obj.value}`;
            const formatNum = (n: number) => `number: ${n}`;

            // Merge the events
            const mergedEvent = E.mergeWith(
                objEvent,
                numEvent,
                formatObj,
                formatNum,
            );
            const results = collectValues(mergedEvent);

            // Emit values from both events
            emitObj({ type: "counter", value: 5 });
            emitNum(42);
            emitObj({ type: "sensor", value: 10 });
            emitNum(100);

            // Verify the merged event received the formatted values
            expect(results.values).toEqual([
                "counter: 5",
                "number: 42",
                "sensor: 10",
                "number: 100",
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(objEvent);
            E.cleanup(numEvent);
            E.cleanup(mergedEvent);
        });

        it("should handle errors within transform functions", () => {
            // Create events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<number>();

            // Define transform functions, one of which will throw errors
            const safeTransform = (x: number) => x * 2;
            const errorTransform = (x: number) => {
                if (x > 5) throw new Error("Value too large");
                return x + 10;
            };

            // Spy on console.error to verify error handling
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            // Merge the events with transform functions
            const mergedEvent = E.mergeWith(
                event1,
                event2,
                safeTransform,
                errorTransform,
            );
            const results = collectValues(mergedEvent);

            // Emit values from both events
            emit1(5); // Should result in 5 * 2 = 10
            emit2(3); // Should result in 3 + 10 = 13
            emit1(3); // Should result in 3 * 2 = 6
            emit2(7); // Should trigger an error but not crash
            emit1(4); // Should still work after the error, 4 * 2 = 8

            // Verify the merged event received the transformed values
            // The value that caused the error should be missing
            expect(results.values).toEqual([10, 13, 6, 8]);

            // Verify the error was logged
            expect(errorSpy).toHaveBeenCalledWith(
                "Error in mergeWith handler:",
                expect.any(Error),
            );

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(mergedEvent);
            errorSpy.mockRestore();
        });

        it("should correctly unsubscribe from source events", () => {
            // Create events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<number>();

            // Create spy functions to track handler calls
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            // Subscribe the spies to the source events
            const unsub1 = E.subscribe(event1, handler1);
            const unsub2 = E.subscribe(event2, handler2);

            // Merge the events
            const mergedEvent = E.mergeWith(
                event1,
                event2,
                (x: number) => x,
                (x: number) => x,
            );

            // Subscribe to merged event
            const { unsubscribe } = collectValues(mergedEvent);

            // Emit some initial values
            emit1(1);
            emit2(2);

            // Verify both handlers were called
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);

            // Reset the mocks
            handler1.mockReset();
            handler2.mockReset();

            // Unsubscribe from the merged event
            unsubscribe();

            // Emit more values
            emit1(3);
            emit2(4);

            // Merged event's handlers should no longer be called
            // But direct subscriptions should still work
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);

            // Clean up
            unsub1();
            unsub2();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(mergedEvent);
        });

        it("should work with empty/never events", () => {
            // Create a regular event and a never event
            const [event, emit] = createTestEvent<number>();
            const neverEvent = E.never<string>();

            // Merge them
            const mergedEvent = E.mergeWith(
                event,
                neverEvent,
                (n: number) => `number: ${n}`,
                (s: string) => s,
            );

            const results = collectValues(mergedEvent);

            // Emit values from the regular event
            emit(1);
            emit(2);
            emit(3);

            // Only the regular event values should appear
            expect(results.values).toEqual([
                "number: 1",
                "number: 2",
                "number: 3",
            ]);

            // Now try the other way around
            const [event2, emit2] = createTestEvent<string>();
            const neverEvent2 = E.never<number>();

            const mergedEvent2 = E.mergeWith(
                neverEvent2,
                event2,
                (n: number) => `number: ${n}`,
                (s: string) => s,
            );

            const results2 = collectValues(mergedEvent2);

            // Emit values from the regular event
            emit2("a");
            emit2("b");
            emit2("c");

            // Only the regular event values should appear
            expect(results2.values).toEqual(["a", "b", "c"]);

            // Clean up
            results.unsubscribe();
            results2.unsubscribe();
            E.cleanup(event);
            E.cleanup(mergedEvent);
            E.cleanup(event2);
            E.cleanup(mergedEvent2);
        });

        it("should correctly handle synchronous events", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<number>();

            // Define transform functions
            const double = (x: number) => x * 2;
            const square = (x: number) => x * x;

            // Merge the events with transform functions
            const mergedEvent = E.mergeWith(event1, event2, double, square);
            const results = collectValues(mergedEvent);

            // Emit values from both events in rapid succession
            // Testing the behavior when multiple events fire in the same "tick"
            for (let i = 1; i <= 5; i++) {
                emit1(i);
                emit2(i);
            }

            // Verify all values were processed correctly
            // Each value should be both doubled and squared
            expect(results.values).toEqual([
                2, // 1 * 2
                1, // 1 * 1
                4, // 2 * 2
                4, // 2 * 2
                6, // 3 * 2
                9, // 3 * 3
                8, // 4 * 2
                16, // 4 * 4
                10, // 5 * 2
                25, // 5 * 5
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(mergedEvent);
        });
    });

    describe("Event filter function", () => {
        it("should filter out values that don't match the predicate", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a filter for even numbers
            const isEven = (x: number) => x % 2 === 0;
            const filteredEvent = E.filter(event, isEven);

            const results = collectValues(filteredEvent);

            // Emit a series of numbers
            emit(1); // odd, should be filtered out
            emit(2); // even, should pass through
            emit(3); // odd, should be filtered out
            emit(4); // even, should pass through
            emit(5); // odd, should be filtered out
            emit(6); // even, should pass through

            // Verify only even numbers made it through
            expect(results.values).toEqual([2, 4, 6]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(filteredEvent);
        });

        it("should handle complex object filtering", () => {
            // Create an event of objects
            const [event, emit] = createTestEvent<{
                id: number;
                name: string;
                active: boolean;
            }>();

            // Filter for active entries
            const isActive = (entry: { active: boolean }) => entry.active;
            const filteredEvent = E.filter(event, isActive);

            const results = collectValues(filteredEvent);

            // Emit some objects
            emit({ id: 1, name: "First", active: true });
            emit({ id: 2, name: "Second", active: false });
            emit({ id: 3, name: "Third", active: true });
            emit({ id: 4, name: "Fourth", active: false });

            // Verify only active entries made it through
            expect(results.values).toEqual([
                { id: 1, name: "First", active: true },
                { id: 3, name: "Third", active: true },
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(filteredEvent);
        });

        it("should handle errors in the predicate function", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a predicate that sometimes throws errors
            const errorProne = (x: number) => {
                if (x > 3) throw new Error("Value too large");
                return x % 2 === 0;
            };

            // Spy on console.error to verify error handling
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            const filteredEvent = E.filter(event, errorProne);
            const results = collectValues(filteredEvent);

            // Emit values
            emit(1); // odd, filtered out
            emit(2); // even, passes through
            emit(3); // odd, filtered out
            emit(4); // should cause error, filtered out
            emit(2); // even, should still pass through after error

            // Verify results
            expect(results.values).toEqual([2, 2]);

            // Verify the error was logged
            expect(errorSpy).toHaveBeenCalledWith(
                "Error in filter predicate:",
                expect.any(Error),
            );

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(filteredEvent);
            errorSpy.mockRestore();
        });

        it("should work with always-true and always-false predicates", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create always-true and always-false filters
            const alwaysTrue = E.filter(event, () => true);
            const alwaysFalse = E.filter(event, () => false);

            const trueResults = collectValues(alwaysTrue);
            const falseResults = collectValues(alwaysFalse);

            // Emit some values
            emit(1);
            emit(2);
            emit(3);

            // Verify all values pass through the always-true filter
            expect(trueResults.values).toEqual([1, 2, 3]);

            // Verify no values pass through the always-false filter
            expect(falseResults.values).toEqual([]);

            // Clean up
            trueResults.unsubscribe();
            falseResults.unsubscribe();
            E.cleanup(event);
            E.cleanup(alwaysTrue);
            E.cleanup(alwaysFalse);
        });

        it("should stop predicate evaluation after unsubscribe", () => {
            const [event, emit] = createTestEvent<number>();
            const predicate = vi.fn((n: number) => n % 2 === 0);
            const filteredEvent = E.filter(event, predicate);
            const values: number[] = [];
            const unsubscribe = E.subscribe(filteredEvent, (value) => {
                values.push(value);
            });

            emit(1);
            emit(2);
            expect(values).toEqual([2]);
            expect(predicate).toHaveBeenCalledTimes(2);

            unsubscribe();
            emit(3);
            emit(4);

            expect(values).toEqual([2]);
            expect(predicate).toHaveBeenCalledTimes(2);

            E.cleanup(event);
            E.cleanup(filteredEvent);
        });

        it("should work with filterApply using a reactive predicate", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive predicate that can change
            const [threshold, setThreshold] = createTestEvent<number>();
            const reactivePredicate = R.map(
                E.stepper(threshold, 2),
                (t) => (n: number) => n > t,
            );

            // Filter using the reactive predicate
            const filteredEvent = E.filterApply(event, reactivePredicate);
            const results = collectValues(filteredEvent);

            // Emit values with the initial threshold (2)
            emit(1); // below threshold, filtered out
            emit(2); // equal to threshold, filtered out
            emit(3); // above threshold, passes through
            emit(4); // above threshold, passes through

            // Change the threshold
            setThreshold(3);

            // Emit more values
            emit(2); // below new threshold, filtered out
            emit(3); // equal to new threshold, filtered out
            emit(4); // above new threshold, passes through

            // Verify only values above the respective thresholds made it through
            expect(results.values).toEqual([3, 4, 4]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(threshold);
            E.cleanup(filteredEvent);
        });

        it("should allow chaining of filter operations", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a chain of filters: even numbers greater than 5
            const evenNumbers = E.filter(event, (n) => n % 2 === 0);
            const largeEvenNumbers = E.filter(evenNumbers, (n) => n > 5);

            const results = collectValues(largeEvenNumbers);

            // Emit a range of values
            for (let i = 1; i <= 10; i++) {
                emit(i);
            }

            // Verify only even numbers greater than 5 made it through
            expect(results.values).toEqual([6, 8, 10]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(evenNumbers);
            E.cleanup(largeEvenNumbers);
        });

        it("should handle null and undefined values correctly", () => {
            // Create an event that might have null or undefined values
            const [event, emit] = createTestEvent<number | null | undefined>();

            // Filter out null and undefined values
            const isNotNullish = (x: number | null | undefined) => x != null;
            const filteredEvent = E.filter(event, isNotNullish);

            const results = collectValues(filteredEvent);

            // Emit a mix of values
            emit(1);
            emit(null);
            emit(2);
            emit(undefined);
            emit(3);

            // Verify only non-null, non-undefined values made it through
            expect(results.values).toEqual([1, 2, 3]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(filteredEvent);
        });
    });

    describe("Event fold function", () => {
        it("should accumulate values with a reducer function", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a fold that sums values
            const sum = E.fold(event, 0, (acc, val) => acc + val);

            // Subscribe to the reactive result
            const values: number[] = [];
            const unsubscribe = R.subscribe(sum, (value) => {
                values.push(value);
            });

            // Emit a series of numbers
            emit(1);
            emit(2);
            emit(3);
            emit(4);
            emit(5);

            // Verify accumulated values
            // [0, 1, 3, 6, 10, 15] - starting with initial value and adding each emission
            expect(values).toEqual([0, 1, 3, 6, 10, 15]);

            // Clean up
            unsubscribe();
            E.cleanup(event);
            R.cleanup(sum);
        });

        it("should work with different types of accumulators", () => {
            // Create an event of strings
            const [event, emit] = createTestEvent<string>();

            // Create a fold that concatenates strings with a separator
            const concat = E.fold(event, "", (acc, val) =>
                acc === "" ? val : `${acc}, ${val}`,
            );

            // Subscribe to the reactive result
            const values: string[] = [];
            const unsubscribe = R.subscribe(concat, (value) => {
                values.push(value);
            });

            // Emit a series of strings
            emit("apple");
            emit("banana");
            emit("cherry");

            // Verify accumulated values
            expect(values).toEqual([
                "",
                "apple",
                "apple, banana",
                "apple, banana, cherry",
            ]);

            // Clean up
            unsubscribe();
            E.cleanup(event);
            R.cleanup(concat);
        });

        it("should create complex accumulated structures", () => {
            // Create an event of objects
            const [event, emit] = createTestEvent<{
                id: number;
                count: number;
            }>();

            // Fold into a map-like object where keys are ids
            const collector = E.fold(
                event,
                {} as Record<number, number>,
                (acc, val) => {
                    return {
                        ...acc,
                        [val.id]: (acc[val.id] || 0) + val.count,
                    };
                },
            );

            // Subscribe to the reactive result
            const values: Record<number, number>[] = [];
            const unsubscribe = R.subscribe(collector, (value) => {
                // Make a copy to avoid reference issues in the test
                values.push({ ...value });
            });

            // Emit a series of objects
            emit({ id: 1, count: 5 });
            emit({ id: 2, count: 3 });
            emit({ id: 1, count: 2 });
            emit({ id: 3, count: 1 });
            emit({ id: 2, count: 4 });

            // Verify accumulated structure
            expect(values).toEqual([
                {},
                { 1: 5 },
                { 1: 5, 2: 3 },
                { 1: 7, 2: 3 },
                { 1: 7, 2: 3, 3: 1 },
                { 1: 7, 2: 7, 3: 1 },
            ]);

            // Clean up
            unsubscribe();
            E.cleanup(event);
            R.cleanup(collector);
        });

        it("should handle errors in the fold function", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Spy on console.error to verify error handling
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            // Create a fold that sometimes throws errors
            const errorProne = E.fold(event, 0, (acc, val) => {
                if (val > 3) {
                    throw new Error("Value too large");
                }
                return acc + val;
            });

            // Subscribe to the reactive result
            const values: number[] = [];
            const unsubscribe = R.subscribe(errorProne, (value) => {
                values.push(value);
            });

            // Emit values including ones that will cause errors
            emit(1);
            emit(2);
            emit(4); // This should cause an error
            emit(3);

            // Verify accumulated values (the error should not affect the existing acc)
            expect(values).toEqual([0, 1, 3, 6]);

            // Verify the error was logged
            expect(errorSpy).toHaveBeenCalledWith(
                "Error in fold function:",
                expect.any(Error),
            );

            // Clean up
            unsubscribe();
            E.cleanup(event);
            R.cleanup(errorProne);
            errorSpy.mockRestore();
        });

        it("should work with empty events", () => {
            // Create a never event
            const neverEvent = E.never<number>();

            // Create a fold
            const sum = E.fold(neverEvent, 0, (acc, val) => acc + val);

            // Subscribe to the reactive result
            const values: number[] = [];
            const unsubscribe = R.subscribe(sum, (value) => {
                values.push(value);
            });

            // Verify only the initial value is present
            expect(values).toEqual([0]);

            // Clean up
            unsubscribe();
            R.cleanup(sum);
        });

        it("should clean up subscriptions when the reactive is cleaned up", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a spy for the event handler
            const handlerSpy = vi.fn();

            // Subscribe to the original event to track emissions
            const eventUnsub = E.subscribe(event, handlerSpy);

            // Create a fold
            const sum = E.fold(event, 0, (acc, val) => acc + val);

            // Get the current value to ensure the fold is connected
            const initialSum = R.get(sum);
            expect(initialSum).toBe(0);

            // Clean up the fold
            R.cleanup(sum);

            // Emit a value after cleanup
            emit(5);

            // Verify the event is still active, but the fold no longer updates
            expect(handlerSpy).toHaveBeenCalledTimes(1);
            expect(R.get(sum)).toBe(0); // Should still be the initial value

            // Clean up remaining subscriptions
            eventUnsub();
            E.cleanup(event);
        });

        it("should support various accumulator types and operations", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create different folds with the same event source
            const sum = E.fold(event, 0, (acc, val) => acc + val);
            const product = E.fold(event, 1, (acc, val) => acc * val);
            const max = E.fold(event, -Infinity, (acc, val) =>
                Math.max(acc, val),
            );
            const min = E.fold(event, Infinity, (acc, val) =>
                Math.min(acc, val),
            );
            const count = E.fold(event, 0, (acc, _) => acc + 1);
            const all = E.fold(event, [] as number[], (acc, val) => [
                ...acc,
                val,
            ]);

            // Store the results
            const results = {
                sum: [] as number[],
                product: [] as number[],
                max: [] as number[],
                min: [] as number[],
                count: [] as number[],
                all: [] as number[][],
            };

            // Subscribe to all the folds
            const unsubs = [
                R.subscribe(sum, (val) => results.sum.push(val)),
                R.subscribe(product, (val) => results.product.push(val)),
                R.subscribe(max, (val) => results.max.push(val)),
                R.subscribe(min, (val) => results.min.push(val)),
                R.subscribe(count, (val) => results.count.push(val)),
                R.subscribe(all, (val) => results.all.push([...val])), // Copy the array to avoid reference issues
            ];

            // Emit a series of values
            emit(2);
            emit(5);
            emit(3);
            emit(1);
            emit(4);

            // Verify all the different accumulated values
            expect(results.sum).toEqual([0, 2, 7, 10, 11, 15]);
            expect(results.product).toEqual([1, 2, 10, 30, 30, 120]);
            expect(results.max).toEqual([-Infinity, 2, 5, 5, 5, 5]);
            expect(results.min).toEqual([Infinity, 2, 2, 2, 1, 1]);
            expect(results.count).toEqual([0, 1, 2, 3, 4, 5]);
            expect(results.all).toEqual([
                [],
                [2],
                [2, 5],
                [2, 5, 3],
                [2, 5, 3, 1],
                [2, 5, 3, 1, 4],
            ]);

            // Clean up
            unsubs.forEach((unsub) => unsub());
            E.cleanup(event);
            R.cleanup(sum);
            R.cleanup(product);
            R.cleanup(max);
            R.cleanup(min);
            R.cleanup(count);
            R.cleanup(all);
        });

        it("should create a stateful reactive that updates with each new event", () => {
            // Create an event
            const [event, emit] = createTestEvent<string>();

            // Create an array of events and timestamps
            interface LogEntry {
                event: string;
                timestamp: number;
            }

            // Mock the date to have consistent timestamps in tests
            const mockDate = vi.spyOn(Date, "now");
            mockDate.mockReturnValue(1000);

            // Create a fold that builds a log
            const eventLog = E.fold(event, [] as LogEntry[], (log, event) => {
                // Add new entry to the log
                return [...log, { event, timestamp: Date.now() }];
            });

            // Subscribe to the reactive result
            const snapshots: LogEntry[][] = [];
            const unsubscribe = R.subscribe(eventLog, (value) => {
                // Make a deep copy to avoid reference issues
                snapshots.push(JSON.parse(JSON.stringify(value)));
            });

            // Emit a series of events with increasing timestamps
            mockDate.mockReturnValue(1000);
            emit("started");

            mockDate.mockReturnValue(1500);
            emit("progress-25");

            mockDate.mockReturnValue(2000);
            emit("progress-50");

            mockDate.mockReturnValue(2500);
            emit("progress-75");

            mockDate.mockReturnValue(3000);
            emit("completed");

            // Verify the log entries
            expect(snapshots).toEqual([
                [],
                [{ event: "started", timestamp: 1000 }],
                [
                    { event: "started", timestamp: 1000 },
                    { event: "progress-25", timestamp: 1500 },
                ],
                [
                    { event: "started", timestamp: 1000 },
                    { event: "progress-25", timestamp: 1500 },
                    { event: "progress-50", timestamp: 2000 },
                ],
                [
                    { event: "started", timestamp: 1000 },
                    { event: "progress-25", timestamp: 1500 },
                    { event: "progress-50", timestamp: 2000 },
                    { event: "progress-75", timestamp: 2500 },
                ],
                [
                    { event: "started", timestamp: 1000 },
                    { event: "progress-25", timestamp: 1500 },
                    { event: "progress-50", timestamp: 2000 },
                    { event: "progress-75", timestamp: 2500 },
                    { event: "completed", timestamp: 3000 },
                ],
            ]);

            // Clean up
            unsubscribe();
            E.cleanup(event);
            R.cleanup(eventLog);
            mockDate.mockRestore();
        });
    });

    describe("Event zip function", () => {
        it("should combine events into pairs in order", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            // Zip the events
            const zipped = E.zip(event1, event2);
            const results = collectValues(zipped);

            // Emit values in a balanced way
            emit1(1);
            emit2("a");
            emit1(2);
            emit2("b");
            emit1(3);
            emit2("c");

            // Verify pairs are created in order
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(zipped);
        });

        it("should buffer values until pairs can be formed", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            // Zip the events
            const zipped = E.zip(event1, event2);
            const results = collectValues(zipped);

            // Emit values in an unbalanced way
            emit1(1);
            emit1(2);
            emit1(3);
            // No pairs emitted yet because we need values from event2
            expect(results.values).toEqual([]);

            // Now emit values from the second event
            emit2("a"); // Should pair with 1
            expect(results.values).toEqual([[1, "a"]]);

            emit2("b"); // Should pair with 2
            emit2("c"); // Should pair with 3
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
            ]);

            // Emit more values from first event, which should be buffered
            emit1(4);
            emit1(5);
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
            ]);

            // Complete the pairs
            emit2("d");
            emit2("e");
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
                [4, "d"],
                [5, "e"],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(zipped);
        });

        it("should handle empty events", () => {
            // Create a regular event and a never event
            const [event, emit] = createTestEvent<number>();
            const neverEvent = E.never<string>();

            // Zip them
            const zipped = E.zip(event, neverEvent);
            const results = collectValues(zipped);

            // Emit values to the regular event
            emit(1);
            emit(2);
            emit(3);

            // No pairs should be formed since the never event never emits
            expect(results.values).toEqual([]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event);
            E.cleanup(zipped);
        });

        it("should support complex object types", () => {
            // Create events with complex objects
            const [users, emitUser] = createTestEvent<{
                id: number;
                name: string;
            }>();
            const [scores, emitScore] = createTestEvent<{
                value: number;
                timestamp: number;
            }>();

            // Zip the events
            const usersWithScores = E.zip(users, scores);
            const results = collectValues(usersWithScores);

            // Emit some values
            emitUser({ id: 1, name: "Alice" });
            emitScore({ value: 85, timestamp: 1000 });
            emitUser({ id: 2, name: "Bob" });
            emitScore({ value: 92, timestamp: 1500 });

            // Verify the pairs
            expect(results.values).toEqual([
                [
                    { id: 1, name: "Alice" },
                    { value: 85, timestamp: 1000 },
                ],
                [
                    { id: 2, name: "Bob" },
                    { value: 92, timestamp: 1500 },
                ],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(users);
            E.cleanup(scores);
            E.cleanup(usersWithScores);
        });

        it("should clean up queues when unsubscribing", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            // Zip the events
            const zipped = E.zip(event1, event2);

            // Subscribe with a short-lived subscription
            const { unsubscribe } = collectValues(zipped);

            // Emit some unbalanced values
            emit1(1);
            emit1(2);
            emit1(3);

            console.log("Before unsubscribe");
            // Unsubscribe before pairing is complete
            unsubscribe();

            console.log("Subscribing again.");
            // Create a new subscription
            const newResults = collectValues(zipped);

            // Emit values that should create new pairs
            // This checks if the previous queues were properly cleared
            emit1(4);
            emit2("a");

            // If queues were properly cleared, this should be the first pair
            expect(newResults.values).toEqual([[4, "a"]]);

            // Verify no more values were emitted from the previous queue
            emit2("b");
            expect(newResults.values).toEqual([
                [4, "a"],
                // If the queue wasn't cleared, we might see [1, "a"], [2, "b"] here
            ]);

            // Clean up
            newResults.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(zipped);
        });

        it("should handle rapid emissions correctly", () => {
            // Create two events
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            // Zip the events
            const zipped = E.zip(event1, event2);
            const results = collectValues(zipped);

            // Emit values rapidly in succession
            for (let i = 1; i <= 5; i++) {
                emit1(i);
            }

            for (let i = 0; i < 5; i++) {
                const letter = String.fromCharCode(97 + i); // a, b, c, d, e
                emit2(letter);
            }

            // Verify all pairs were created correctly
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
                [4, "d"],
                [5, "e"],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(event1);
            E.cleanup(event2);
            E.cleanup(zipped);
        });

        it("should compose with other event operations", () => {
            // Create two events
            const [numbers, emitNumber] = createTestEvent<number>();
            const [strings, emitString] = createTestEvent<string>();

            // Create filtered versions of the events
            const evenNumbers = E.filter(numbers, (n) => n % 2 === 0);
            const upperStrings = E.map(strings, (s) => s.toUpperCase());

            // Zip the processed events
            const zipped = E.zip(evenNumbers, upperStrings);

            // Transform the pairs
            const combined = E.map(zipped, ([num, str]) => `${str}${num}`);

            const results = collectValues(combined);

            // Emit various values
            emitNumber(1); // filtered out (odd)
            emitNumber(2); // even, will be used
            emitString("a"); // will become "A"
            emitNumber(3); // filtered out (odd)
            emitNumber(4); // even, will be used
            emitString("b"); // will become "B"

            // Verify the chain of operations works correctly
            expect(results.values).toEqual(["A2", "B4"]);

            // Clean up
            results.unsubscribe();
            E.cleanup(numbers);
            E.cleanup(strings);
            E.cleanup(evenNumbers);
            E.cleanup(upperStrings);
            E.cleanup(zipped);
            E.cleanup(combined);
        });

        it("should work with zipAll for multiple events", () => {
            // Create three events
            const [nums, emitNum] = createTestEvent<number>();
            const [strs, emitStr] = createTestEvent<string>();
            const [bools, emitBool] = createTestEvent<boolean>();

            // Zip all three events
            const zipped = E.zipAll(nums, strs, bools);
            const results = collectValues(zipped);

            // Emit values
            emitNum(1);
            emitStr("a");
            emitBool(true);

            emitNum(2);
            emitStr("b");
            emitBool(false);

            // Verify tuples with all three values
            expect(results.values).toEqual([
                [1, "a", true],
                [2, "b", false],
            ]);

            // Emit values in an unbalanced way
            emitNum(3);
            emitNum(4);
            emitStr("c");
            emitBool(true);
            emitStr("d");
            emitBool(false);

            // Verify all tuples are created correctly
            expect(results.values).toEqual([
                [1, "a", true],
                [2, "b", false],
                [3, "c", true],
                [4, "d", false],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(nums);
            E.cleanup(strs);
            E.cleanup(bools);
            E.cleanup(zipped);
        });

        it("should maintain proper closure over event sources", () => {
            // Test that zip properly maintains independent zipped pairs
            // even when multiple zip operations are performed

            // Create events
            const [nums1, emitNums1] = createTestEvent<number>();
            const [strs1, emitStrs1] = createTestEvent<string>();

            const [nums2, emitNums2] = createTestEvent<number>();
            const [strs2, emitStrs2] = createTestEvent<string>();

            // Create two independent zipped pairs
            const zipped1 = E.zip(nums1, strs1);
            const zipped2 = E.zip(nums2, strs2);

            // Collect results from both
            const results1 = collectValues(zipped1);
            const results2 = collectValues(zipped2);

            // Emit to the first pair
            emitNums1(1);
            emitStrs1("a");

            // Emit to the second pair
            emitNums2(100);
            emitStrs2("z");

            // Verify each zip operation maintains its own independent state
            expect(results1.values).toEqual([[1, "a"]]);
            expect(results2.values).toEqual([[100, "z"]]);

            // More emissions to both
            emitNums1(2);
            emitNums2(200);
            emitStrs1("b");
            emitStrs2("y");

            // Verify they remain independent
            expect(results1.values).toEqual([
                [1, "a"],
                [2, "b"],
            ]);
            expect(results2.values).toEqual([
                [100, "z"],
                [200, "y"],
            ]);

            // Clean up
            results1.unsubscribe();
            results2.unsubscribe();
            E.cleanup(nums1);
            E.cleanup(strs1);
            E.cleanup(nums2);
            E.cleanup(strs2);
            E.cleanup(zipped1);
            E.cleanup(zipped2);
        });

        it("should handle staggered emissions with long gaps", () => {
            // Create events
            const [nums, emitNum] = createTestEvent<number>();
            const [strs, emitStr] = createTestEvent<string>();

            // Zip the events
            const zipped = E.zip(nums, strs);
            const results = collectValues(zipped);

            // First set of emissions
            emitNum(1);
            emitNum(2);

            // Nothing should be emitted yet
            expect(results.values).toEqual([]);

            // Complete first pair after delay
            emitStr("a");
            expect(results.values).toEqual([[1, "a"]]);

            // Emit more numbers with no string pairs
            emitNum(3);
            emitNum(4);
            emitNum(5);

            // Still just the first pair
            expect(results.values).toEqual([[1, "a"]]);

            // Now emit multiple strings to catch up
            emitStr("b");
            emitStr("c");

            // Should have paired with the waiting numbers
            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
            ]);

            // Finish remaining pairs
            emitStr("d");
            emitStr("e");

            expect(results.values).toEqual([
                [1, "a"],
                [2, "b"],
                [3, "c"],
                [4, "d"],
                [5, "e"],
            ]);

            // Clean up
            results.unsubscribe();
            E.cleanup(nums);
            E.cleanup(strs);
            E.cleanup(zipped);
        });
    });

    describe("switchE function", () => {
        // Helper function to create test events
        function createTestEvent<A>(): [E.Event<A>, (value: A) => void] {
            return E.create<A>();
        }

        it("should initially use the initialEvent", () => {
            // Create initial event and event-of-events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Track values from the switched event
            const receivedValues: number[] = [];
            const subscription = E.subscribe(switchedEvent, (value) => {
                receivedValues.push(value);
            });

            // Emit values on the initial event
            emitInitial(1);
            emitInitial(2);

            // Check that values from initial event are received
            expect(receivedValues).toEqual([1, 2]);

            // Clean up
            subscription();
            E.cleanup(switchedEvent);
        });

        it("should switch to a new event when emitted from eventOfEvents", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent1, emitNew1] = createTestEvent<number>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Track values from the switched event
            const receivedValues: number[] = [];
            const subscription = E.subscribe(switchedEvent, (value) => {
                receivedValues.push(value);
            });

            // Emit values on the initial event
            emitInitial(1);

            // Switch to new event
            emitEventOfEvents(newEvent1);

            // Emit values on both events
            emitInitial(2); // Should be ignored now
            emitNew1(3); // Should be received

            // Check that the correct values were received
            expect(receivedValues).toEqual([1, 3]);

            // Clean up
            subscription();
            E.cleanup(switchedEvent);
        });

        it("should handle multiple switches between events", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent1, emitNew1] = createTestEvent<number>();
            const [newEvent2, emitNew2] = createTestEvent<number>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Track values from the switched event
            const receivedValues: number[] = [];
            const subscription = E.subscribe(switchedEvent, (value) => {
                receivedValues.push(value);
            });

            // Emit values on the initial event
            emitInitial(1);

            // Switch to first new event
            emitEventOfEvents(newEvent1);
            emitNew1(2);

            // Switch to second new event
            emitEventOfEvents(newEvent2);
            emitNew1(3); // Should be ignored
            emitNew2(4); // Should be received

            // Switch back to initial event
            emitEventOfEvents(initialEvent);
            emitNew2(5); // Should be ignored
            emitInitial(6); // Should be received

            // Check that the correct values were received
            expect(receivedValues).toEqual([1, 2, 4, 6]);

            // Clean up
            subscription();
            E.cleanup(switchedEvent);
        });

        it("should handle multiple subscribers correctly", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent, emitNew] = createTestEvent<number>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Track values for first subscriber
            const values1: number[] = [];
            const subscription1 = E.subscribe(switchedEvent, (value) => {
                values1.push(value);
            });

            // Emit initial value
            emitInitial(1);

            // Add second subscriber
            const values2: number[] = [];
            const subscription2 = E.subscribe(switchedEvent, (value) => {
                values2.push(value);
            });

            // Switch to new event
            emitEventOfEvents(newEvent);
            emitNew(2);

            // Check values for both subscribers
            expect(values1).toEqual([1, 2]);
            expect(values2).toEqual([2]); // Second subscriber joined after value 1

            // Clean up
            subscription1();
            subscription2();
            E.cleanup(switchedEvent);
        });

        it("should unsubscribe from previous event when switching", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent, emitNew] = createTestEvent<number>();

            // Create mock cleanup tracking
            let initialCleanupCalled = false;
            let newEventCleanupCalled = false;

            // Add cleanup functions to track when they're called
            E.onCleanup(initialEvent, () => {
                initialCleanupCalled = true;
            });

            E.onCleanup(newEvent, () => {
                newEventCleanupCalled = true;
            });

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Subscribe
            const values: number[] = [];
            const subscription = E.subscribe(switchedEvent, (value) => {
                values.push(value);
            });

            // Switch to new event
            emitEventOfEvents(newEvent);

            // Check that cleanup was called on the initial event
            expect(initialCleanupCalled).toBe(true);

            // Switch again should clean up the new event
            const [anotherEvent, emitAnother] = createTestEvent<number>();
            emitEventOfEvents(anotherEvent);

            // Check that cleanup was called on the new event
            expect(newEventCleanupCalled).toBe(true);

            // Clean up
            subscription();
            E.cleanup(switchedEvent);

            // Restore original cleanup function
            E.cleanup(switchedEvent);
        });

        it("should handle subscription/unsubscription during event switching", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent, emitNew] = createTestEvent<number>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // First subscription
            const values1: number[] = [];
            const subscription1 = E.subscribe(switchedEvent, (value) => {
                values1.push(value);
            });

            // Emit initial values
            emitInitial(1);

            // Unsubscribe before switching
            subscription1();

            // Switch to new event
            emitEventOfEvents(newEvent);

            // New subscription after switching
            const values2: number[] = [];
            const subscription2 = E.subscribe(switchedEvent, (value) => {
                values2.push(value);
            });

            // Emit on new event
            emitNew(2);

            // Check values
            expect(values1).toEqual([1]);
            expect(values2).toEqual([2]);

            // Clean up
            subscription2();
            E.cleanup(switchedEvent);
        });

        it("should clean up properly when the switched event is cleaned up", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();

            // Track cleanup calls
            let resultEventCleanupCalled = false;
            let currentEventCleanupCalled = false;
            let eventOfEventsCleanupCalled = false;

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);


            // Register our own cleanup trackers
            E.onCleanup(switchedEvent, () => {
                resultEventCleanupCalled = true;
            });

            E.onCleanup(initialEvent, () => {
                currentEventCleanupCalled = true;
            });

            E.onCleanup(eventOfEvents, () => {
                console.log("Cleaning up eventOfEvents");
                eventOfEventsCleanupCalled = true;
            });

            // Subscribe to the switched event
            const unsub = E.subscribe(switchedEvent, () => {});

            // Clean up the switched event
            unsub();
            E.cleanup(switchedEvent);

            // Check that our cleanup functions were called
            expect(resultEventCleanupCalled).toBe(true);
            expect(eventOfEventsCleanupCalled).toBe(true);
            expect(currentEventCleanupCalled).toBe(true);

            // Restore original function
            // addCleanupSpy.mockRestore();
        });

        // Test for handling errors during event emission
        it("should continue working after errors in event handlers", () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Create one handler that throws and one that doesn't
            const values: number[] = [];

            // First subscription - throws an error
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});
            const subscription1 = E.subscribe(switchedEvent, (value) => {
                if (value === 2) {
                    throw new Error("Test error in handler");
                }
            });

            // Second subscription - records values normally
            const subscription2 = E.subscribe(switchedEvent, (value) => {
                values.push(value);
            });

            // Emit values
            emitInitial(1);
            emitInitial(2); // This will cause an error in the first handler
            emitInitial(3);

            // Check that the second handler received all values
            expect(values).toEqual([1, 2, 3]);

            // Check that console.error was called for the error
            expect(errorSpy).toHaveBeenCalled();

            // Clean up
            errorSpy.mockRestore();
            subscription1();
            subscription2();
            E.cleanup(switchedEvent);
        });

        // Test for async behavior
        it("should handle asynchronous event emissions", async () => {
            // Create events
            const [initialEvent, emitInitial] = createTestEvent<number>();
            const [eventOfEvents, emitEventOfEvents] =
                createTestEvent<E.Event<number>>();
            const [newEvent, emitNew] = createTestEvent<number>();

            // Create the switched event
            const switchedEvent = E.switchE(initialEvent, eventOfEvents);

            // Track values from the switched event
            const receivedValues: number[] = [];
            const subscription = E.subscribe(switchedEvent, (value) => {
                receivedValues.push(value);
            });

            // Emit initial value
            emitInitial(1);

            // Switch after a delay
            await new Promise((resolve) => setTimeout(resolve, 10));
            emitEventOfEvents(newEvent);

            // Emit on new event after another delay
            await new Promise((resolve) => setTimeout(resolve, 10));
            emitNew(2);

            // Check values
            expect(receivedValues).toEqual([1, 2]);

            // Clean up
            subscription();
            E.cleanup(switchedEvent);
        });
    });

    /*
    describe("ap method (Applicative Functor)", () => {
        it("should apply function event to value event", () => {
            // Create a value event and a function event
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [fnEvent, emitFn] = createTestEvent<(x: number) => number>();

            // Apply function event to value event
            const appliedEvent = valueEvent.ap(fnEvent);

            // Collect results
            const results = collectValues(appliedEvent);

            // Emit values and functions
            emitFn((x) => x * 2); // Should result in 5 * 2 = 10

            emitValue(7); // Should result in 7 * 2 = 14

            emitFn((x) => x + 3); // Should result in 7 + 3 = 10

            emitValue(1); // Should result in 1 + 3 = 4

            expect(results.values).toEqual([14, 10, 4]);

            // Clean up
            results.unsubscribe();
            valueEvent.cleanup();
            fnEvent.cleanup();
            appliedEvent.cleanup();
        });

        // Applicative identity law: pure id <*> v = v
        it("should satisfy the identity law", () => {
            const [event, emit] = createTestEvent<number>();

            // Create an event with the identity function
            const [idEvent, emitId] = createTestEvent<(x: number) => number>();

            // Apply identity function event to value event
            const appliedEvent = event.ap(idEvent);

            // Collect results from both events
            const original = collectValues(event);
            const applied = collectValues(appliedEvent);

            emitId((x) => x); // Identity function

            // Emit some values
            emit(1);
            emit(42);
            emit(100);

            // Identity function should not change values
            expect(applied.values).toEqual(original.values);

            // Clean up
            original.unsubscribe();
            applied.unsubscribe();
            event.cleanup();
            idEvent.cleanup();
            appliedEvent.cleanup();
        });

        // Applicative homomorphism law: pure f <*> pure x = pure (f x)
        it("should satisfy the homomorphism law", () => {
            // For events, we can test this by comparing:
            // - an event from a constant applied to another event from a constant
            // - an event created directly from the result of applying the function

            const f = (x: number) => x * 2;
            const x = 5;

            // Create pure function event and pure value event
            const [fnEvent, _] = createTestEvent(f);
            const [valueEvent, __] = createTestEvent(x);

            // Apply pure function to pure value
            const appliedEvent = valueEvent.ap(fnEvent);

            // Create event with the result directly
            const [resultEvent, ___] = createTestEvent(f(x));

            // Collect results
            const applied = collectValues(appliedEvent);
            const direct = collectValues(resultEvent);

            // Results should be the same
            expect(applied.values.length).toBeGreaterThan(0);
            expect(applied.values).toEqual(direct.values);

            // Clean up
            applied.unsubscribe();
            direct.unsubscribe();
            fnEvent.cleanup();
            valueEvent.cleanup();
            appliedEvent.cleanup();
            resultEvent.cleanup();
        });

        // Applicative composition law: pure (.) <*> u <*> v <*> w = u <*> (v <*> w)
        it("should satisfy the composition law", () => {
            // The composition law is harder to test directly with events
            // We'll test a simplified version:
            // (f <*> g <*> x) should be equivalent to (f <*> (g <*> x))

            // Create two function events and a value event
            const [fEvent, emitF] = createTestEvent<(y: number) => number>(
                (y) => y * 2
            );
            const [gEvent, emitG] = createTestEvent<(x: number) => number>(
                (x) => x + 5
            );
            const [xEvent, emitX] = createTestEvent(3);

            // Create a composed function: f . g
            const compose =
                (f: (y: number) => number) =>
                (g: (x: number) => number) =>
                (x: number) =>
                    f(g(x));

            // First approach: (compose <*> f <*> g <*> x)
            const [composeEvent, _] = createTestEvent(compose);
            const step1 = fEvent.ap(composeEvent); // compose <*> f
            const step2 = gEvent.ap(step1); // (compose <*> f) <*> g
            const result1 = xEvent.ap(step2); // (compose <*> f <*> g) <*> x

            // Second approach: (f <*> (g <*> x))
            const applied = xEvent.ap(gEvent); // g <*> x
            const result2 = applied.ap(fEvent); // f <*> (g <*> x)

            // Collect results
            const results1 = collectValues(result1);
            const results2 = collectValues(result2);

            // Emit values to trigger the evaluations
            emitG((x) => x + 10); // g = (x => x + 10)
            emitF((y) => y * 3); // f = (y => y * 3)

            // Results should match
            // For input x=3, g(x)=13, f(g(x))=39
            expect(results1.values[-1]).toEqual(results2.values[-1]);

            // Clean up
            results1.unsubscribe();
            results2.unsubscribe();
            fEvent.cleanup();
            gEvent.cleanup();
            xEvent.cleanup();
            result1.cleanup();
            result2.cleanup();
            composeEvent.cleanup();
            applied.cleanup();
        });

        it("should handle timing of event occurrences correctly", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent(5);
            const [fnEvent, emitFn] = createTestEvent<(x: number) => number>(
                (x) => x
            );

            // Apply function event to value event
            const appliedEvent = valueEvent.ap(fnEvent);

            // Collect results
            const results = collectValues(appliedEvent);

            // Test scenario with multiple changes in sequence
            emitFn((x) => x * 2); // No output yet since we're using initial value (5)
            expect(results.values).toEqual([5, 10]); // Initial value transformation: 5 * 2 = 10

            emitValue(7); // Should emit: 7 * 2 = 14
            expect(results.values).toEqual([5, 10, 14]);

            emitFn((x) => x + 3); // Should emit: 7 + 3 = 10
            expect(results.values).toEqual([5, 10, 14, 10]);

            emitValue(1); // Should emit: 1 + 3 = 4
            expect(results.values).toEqual([5, 10, 14, 10, 4]);

            // Clean up
            results.unsubscribe();
            valueEvent.cleanup();
            fnEvent.cleanup();
            appliedEvent.cleanup();
        });

        it("should handle complex function types", () => {
            // Create an event with object values
            const [objEvent, emitObj] = createTestEvent({
                count: 0,
                name: "default",
            });

            // Create an event with functions that transform objects
            const [fnEvent, emitFn] = createTestEvent<
                (o: { count: number; name: string }) => {
                    count: number;
                    name: string;
                }
            >((o) => o);

            // Apply function event to object event
            const appliedEvent = objEvent.ap(fnEvent);

            // Collect results
            const results = collectValues(appliedEvent);

            // Emit various transformations
            emitFn((o) => ({ ...o, count: o.count + 1 }));
            emitObj({ count: 5, name: "test" });
            emitFn((o) => ({ ...o, name: o.name.toUpperCase() }));

            expect(results.values).toEqual([
                {
                    count: 0,
                    name: "default",
                },
                { count: 1, name: "default" },
                { count: 6, name: "test" },
                { count: 5, name: "TEST" },
            ]);

            // Clean up
            results.unsubscribe();
            objEvent.cleanup();
            fnEvent.cleanup();
            appliedEvent.cleanup();
        });

        it("should handle error cases gracefully", () => {
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            // Create events
            const [valueEvent, emitValue] = createTestEvent(5);
            const [fnEvent, emitFn] = createTestEvent<(x: number) => number>(
                (x) => x
            );

            // Apply function event to value event
            const appliedEvent = valueEvent.ap(fnEvent);

            // Collect results
            const results = collectValues(appliedEvent);

            // Emit a function that throws
            emitFn((x) => {
                throw new Error("Test error");
            });

            // Should have logged the error but not crashed
            expect(errorSpy).toHaveBeenCalled();
            expect(errorSpy.mock.calls[0][0]).toContain(
                "Error applying function in ap"
            );

            // Should still be able to process subsequent events
            emitFn((x) => x * 3);
            emitValue(4);

            expect(results.values).toEqual([5, 15, 12]);

            // Clean up
            results.unsubscribe();
            valueEvent.cleanup();
            fnEvent.cleanup();
            appliedEvent.cleanup();
            errorSpy.mockRestore();
        });
    });
    */

    /*
    describe("chain method (Monad)", () => {
        // Monad left identity law: return a >>= f ≡ f a
        it("should satisfy the left identity law", () => {
            // Create a function that returns an event
            const f = (x: number) => {
                const [event, _] = createTestEvent(x * 2);
                return event;
            };

            // Value to test with
            const a = 5;

            // Create an event with just the value (equivalent to return/pure)
            const [returnA, _] = createTestEvent(a);

            // Apply the chain operation to the "return" event: return a >>= f
            const chainResult = returnA.chain(f);

            // Directly apply the function: f a
            const directResult = f(a);

            // Collect results from both paths
            const chainValues = collectValues(chainResult);
            const directValues = collectValues(directResult);

            // Initial values should be emitted and be equal
            expect(chainValues.values.length).toBeGreaterThan(0);
            expect(chainValues.values).toEqual(directValues.values);

            // Clean up
            chainValues.unsubscribe();
            directValues.unsubscribe();
            chainResult.cleanup();
            directResult.cleanup();
        });

        // Monad right identity law: m >>= return ≡ m
        it("should satisfy the right identity law", () => {
            // Create an event to test with
            const [event, emit] = createTestEvent(0);

            // Define the "return" function
            const returnFn = (x: number) => {
                const [ev, _] = createTestEvent(x);
                return ev;
            };

            // Apply chain with "return": m >>= return
            const chainResult = event.chain(returnFn);

            // Collect results from both the original event and the chained one
            const originalValues = collectValues(event);
            const chainValues = collectValues(chainResult);

            // Emit some values
            emit(1);
            emit(42);
            emit(100);

            // The results should be the same
            expect(chainValues.values).toEqual([0].concat(originalValues.values));

            // Clean up
            originalValues.unsubscribe();
            chainValues.unsubscribe();
            event.cleanup();
            chainResult.cleanup();
        });

        // Monad associativity law: (m >>= f) >>= g ≡ m >>= (\x -> f x >>= g)
        it("should satisfy the associativity law", () => {
            // Create an event to test with
            const [event, emit] = createTestEvent(0);

            // Define two functions that return events
            const f = (x: number) => {
                const [ev, _] = createTestEvent(x + 10);
                return ev;
            };

            const g = (x: number) => {
                const [ev, _] = createTestEvent(x * 2);
                return ev;
            };

            // First approach: (m >>= f) >>= g
            const firstChain = event.chain(f);
            const firstResult = firstChain.chain(g);

            // Second approach: m >>= (\x -> f x >>= g)
            const composedFG = (x: number) => f(x).chain(g);
            const secondResult = event.chain(composedFG);

            // Collect results from both approaches
            const firstValues = collectValues(firstResult);
            const secondValues = collectValues(secondResult);

            // Emit some values
            emit(1); // First: (1+10)*2 = 22, Second: (1+10)*2 = 22
            emit(5); // First: (5+10)*2 = 30, Second: (5+10)*2 = 30

            // Results should be the same
            expect(firstValues.values).toEqual(secondValues.values);

            // Clean up
            firstValues.unsubscribe();
            secondValues.unsubscribe();
            event.cleanup();
            firstChain.cleanup();
            firstResult.cleanup();
            secondResult.cleanup();
        });

        it("should correctly chain events together", { timeout: 5000 }, async () => {
            // Create initial event
            const [baseEvent, emitBase] = createTestEvent<number>();

            // Function that returns an event based on the input
            const createDerivedEvent = (x: number) => {
                const [derived, emitDerived] = createTestEvent();

                // Emit a new value after a short delay to test dynamic behavior
                setTimeout(() => {
                    emitDerived(x * 20);
                }, 10);

                return derived;
            };

            // Chain the base event with the function
            const chainedEvent = baseEvent.chain(createDerivedEvent);

            // Collect results
            const results = collectValues(chainedEvent);

            // Emit values
            emitBase(2); // Should create event with initial value 20

            // Wait for the delayed emissions
            await (new Promise<void>((resolve) => {
                setTimeout(() => {
                    emitBase(3); // Should create event with initial value 30

                    setTimeout(() => {
                        // Check all results
                        expect(results.values).toEqual([0, 20, 40, 30, 60]);

                        // Clean up
                        results.unsubscribe();
                        baseEvent.cleanup();
                        chainedEvent.cleanup();

                        console.log("Resolving")
                        resolve();
                    }, 20);
                }, 20);
            }));
        });

        it("should handle nested chaining correctly", () => {
            // Create initial event
            const [baseEvent, emitBase] = createTestEvent<number>();

            // First-level chain function
            const firstLevel = (x: number) => {
                const [ev1, emit1] = createTestEvent<number>();

                // Emit an additional value
                setTimeout(() => emit1(x * 11), 10);

                return ev1;
            };

            // Second-level chain function
            const secondLevel = (x: number) => {
                const [ev2, emit] = createTestEvent();
                emit(x + 5);
                return ev2;
            };

            // Chain the functions in sequence
            const result = baseEvent.chain(firstLevel).chain(secondLevel);

            // Collect results
            const values = collectValues(result);

            // Emit a value
            emitBase(2); // Should result in (2*10)+5 = 25

            // Wait for all the async emissions
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    // Should now include (2*11)+5 = 27
                    expect(values.values).toEqual([15, 25, 27]);

                    // Emit another value
                    emitBase(3); // Should result in (3*10)+5 = 35

                    setTimeout(() => {
                        // Should now include (3*11)+5 = 38
                        expect(values.values).toEqual([15, 25, 27, 35, 38]);

                        // Clean up
                        values.unsubscribe();
                        baseEvent.cleanup();
                        result.cleanup();

                        resolve();
                    }, 20);
                }, 20);
            });
        });

        it("should clean up inner subscriptions when outer event changes", () => {
            // Create events
            const [baseEvent, emitBase] = createTestEvent(0);

            // Create a mock for cleanup tracking
            const cleanupSpy = vi.fn();

            // Create a function that returns an event with trackable cleanup
            const createTrackableEvent = (x: number) => {
                const [event, _] = createTestEvent(x * 10);

                // Replace the cleanup method with our spy
                const originalCleanup = event.cleanup;
                (event as any).cleanup = () => {
                    cleanupSpy(x);
                    originalCleanup.call(event);
                };

                return event;
            };

            // Chain the base event
            const chained = baseEvent.chain(createTrackableEvent);

            // Subscribe to force evaluation
            const unsub = chained.subscribe(() => {});

            // Emit several values
            emitBase(1);
            emitBase(2);
            emitBase(3);

            // Each new emission should have cleaned up the previous inner event
            expect(cleanupSpy).toHaveBeenCalledTimes(3);
            expect(cleanupSpy).toHaveBeenCalledWith(0);
            expect(cleanupSpy).toHaveBeenCalledWith(1);
            expect(cleanupSpy).toHaveBeenCalledWith(2);

            // Clean up
            unsub();
            baseEvent.cleanup();
            chained.cleanup();

            // Should clean up the final inner event too
            expect(cleanupSpy).toHaveBeenCalledWith(3);
            expect(cleanupSpy).toHaveBeenCalledTimes(4);
        });

        it("should handle errors in the chain function gracefully", () => {
            // Spy on console.error
            const errorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            // Create events
            const [baseEvent, emitBase] = createTestEvent(0);

            // Define a function that will throw for certain inputs
            const problematicFn = (x: number) => {
                if (x === 2) {
                    throw new Error("Test error");
                }
                const [event, _] = createTestEvent(x * 10);
                return event;
            };

            // Chain with the problematic function
            const chained = baseEvent.chain(problematicFn);

            // Collect values
            const results = collectValues(chained);

            // Emit values, including one that will cause an error
            emitBase(1); // Should work fine: 10
            emitBase(2); // Should throw
            emitBase(3); // Should still work: 30

            // Should have logged an error
            expect(errorSpy).toHaveBeenCalled();
            expect(errorSpy.mock.calls[0][0]).toContain(
                "Error in chain function"
            );

            // Should still have processed the valid inputs
            expect(results.values).toEqual([0, 10, 30]);

            // Clean up
            results.unsubscribe();
            baseEvent.cleanup();
            chained.cleanup();
            errorSpy.mockRestore();
        });
    });
    */
});
