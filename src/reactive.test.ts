import { describe, it, expect, vi } from "vitest";
import * as R from "./reactive";
import * as E from "./event";

describe("Reactive", () => {
    describe("Functor Laws", () => {
        // Helper function for deep equality check with a small tolerance for floating point
        const isEqual = (a: any, b: any): boolean => {
            if (typeof a === "number" && typeof b === "number") {
                // Handle floating point comparison with small epsilon
                return Math.abs(a - b) < 1e-10;
            }
            if (typeof a !== typeof b) return false;
            if (typeof a === "object") {
                if (a === null || b === null) return a === b;

                // Handle arrays
                if (Array.isArray(a) && Array.isArray(b)) {
                    if (a.length !== b.length) return false;
                    return a.every((item, i) => isEqual(item, b[i]));
                }

                // Handle objects
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                return keysA.every((key) => isEqual(a[key], b[key]));
            }
            return a === b;
        };

        /**
         * Functor Law 1: Identity
         * map(id) === id
         *
         * Applying the identity function to a reactive value via map
         * should be the same as the original reactive value.
         */
        it("satisfies the identity law", () => {
            // Test with different value types
            const testIdentity = <T>(value: T) => {
                // Create a reactive value
                const reactive = R.of(value);

                // Apply identity function
                const mapped = R.map(reactive, (x) => x);

                // Check that values are the same
                expect(isEqual(R.get(reactive), R.get(mapped))).toBe(true);
            };

            // Test with various value types
            testIdentity(42);
            testIdentity("hello");
            testIdentity(true);
            testIdentity({ name: "Alice", age: 30 });
            testIdentity([1, 2, 3, 4]);
        });

        /**
         * Functor Law 2: Composition
         * map(f ∘ g) === map(f) ∘ map(g)
         *
         * Mapping with a composition of functions should be the same as
         * mapping with one function and then mapping with the other.
         */
        it("satisfies the composition law", () => {
            // Define two simple functions
            const f = (x: number) => x * 2;
            const g = (x: number) => x + 10;
            const composed = (x: number) => f(g(x)); // f ∘ g

            // Test various initial values
            const testValues = [0, 1, -5, 3.14, 42];

            testValues.forEach((value) => {
                // Create reactive value
                const reactive = R.of(value);

                // Apply map(f ∘ g)
                const mapComposed = R.map(reactive, composed);

                // Apply map(f) ∘ map(g)
                const mapChained = R.map(R.map(reactive, g), f);

                // Verify results are the same
                expect(isEqual(R.get(mapComposed), R.get(mapChained))).toBe(
                    true,
                );
            });
        });

        /**
         * Additional test: Functor laws with changing values
         * Verifies that the functor laws hold when reactive values change
         */
        it("maintains functor laws when values change", () => {
            // Create a reactive value that we'll update
            const reactive = R.create(5);

            // Define our functions
            const f = (x: number) => x * 2;
            const g = (x: number) => x + 3;

            // Map with both approaches
            const mapComposed = R.map(reactive, (x) => f(g(x)));
            const mapChained = R.map(R.map(reactive, g), f);

            // Check initial values
            expect(R.get(mapComposed)).toBe(16); // (5 + 3) * 2
            expect(R.get(mapChained)).toBe(16);

            // Update the reactive value
            (reactive as any).updateValueInternal(10);

            // Check that both mapped values update correctly
            expect(R.get(mapComposed)).toBe(26); // (10 + 3) * 2
            expect(R.get(mapChained)).toBe(26);
        });

        /**
         * Test that map doesn't have side effects
         * (beyond updating the resulting reactive value)
         */
        it("map does not mutate the original reactive value", () => {
            const original = R.of(5);
            const mapped = R.map(original, (x) => x * 10);

            // Original should be unchanged
            expect(R.get(original)).toBe(5);
            // Mapped should have the transformed value
            expect(R.get(mapped)).toBe(50);
        });
    });

    describe("Event-Backed Reactive Functor Laws", () => {
        // Helper function to create test events
        function createTestEvent<A>(): [E.Event<A>, (value: A) => void] {
            return E.create<A>();
        }

        // Helper function for deep equality check with a small tolerance for floating point
        const isEqual = (a: any, b: any): boolean => {
            if (typeof a === "number" && typeof b === "number") {
                // Handle floating point comparison with small epsilon
                return Math.abs(a - b) < 1e-10;
            }
            if (typeof a !== typeof b) return false;
            if (typeof a === "object") {
                if (a === null || b === null) return a === b;

                // Handle arrays
                if (Array.isArray(a) && Array.isArray(b)) {
                    if (a.length !== b.length) return false;
                    return a.every((item, i) => isEqual(item, b[i]));
                }

                // Handle objects
                const keysA = Object.keys(a);
                const keysB = Object.keys(b);
                if (keysA.length !== keysB.length) return false;
                return keysA.every((key) => isEqual(a[key], b[key]));
            }
            return a === b;
        };

        /**
         * Functor Law 1: Identity
         * map(id) === id
         *
         * For event-backed reactives: The identity law should hold
         * even as new values are emitted through events.
         */
        it("satisfies the identity law for event-backed reactives", () => {
            // Test with different value types
            const testIdentity = <T>(initialValue: T, newValue: T) => {
                // Create an event and a reactive backed by it
                const [event, emit] = createTestEvent<T>();
                const reactive = R.create(initialValue, event);

                // Apply identity function
                const mapped = R.map(reactive, (x) => x);

                // Check initial values
                expect(isEqual(R.get(reactive), R.get(mapped))).toBe(true);

                // Track all values from both reactives
                const reactiveValues: T[] = [];
                const mappedValues: T[] = [];

                const unsubReactive = R.subscribe(reactive, (value) => {
                    reactiveValues.push(value);
                });

                const unsubMapped = R.subscribe(mapped, (value) => {
                    mappedValues.push(value);
                });

                // Emit a new value
                emit(newValue);

                // Check that both reactive and mapped received the same values
                expect(reactiveValues.length).toBe(2); // Initial + emitted
                expect(mappedValues.length).toBe(2); // Initial + emitted
                expect(isEqual(reactiveValues, mappedValues)).toBe(true);

                // Clean up
                unsubReactive();
                unsubMapped();
            };

            // Test with various value types
            testIdentity(42, 99);
            testIdentity("hello", "world");
            testIdentity(true, false);
            testIdentity({ name: "Alice", age: 30 }, { name: "Bob", age: 25 });
            testIdentity([1, 2, 3, 4], [5, 6, 7, 8]);
        });

        /**
         * Functor Law 2: Composition
         * map(f ∘ g) === map(f) ∘ map(g)
         *
         * For event-backed reactives: The composition law should hold
         * as new values are emitted through events.
         */
        it("satisfies the composition law for event-backed reactives", () => {
            // Define two simple functions
            const f = (x: number) => x * 2;
            const g = (x: number) => x + 10;
            const composed = (x: number) => f(g(x)); // f ∘ g

            // Test with initial and new values
            const testCases = [
                { initial: 0, newValue: 5 },
                { initial: 1, newValue: -3 },
                { initial: -5, newValue: 7 },
                { initial: 3.14, newValue: 2.71 },
                { initial: 42, newValue: 100 },
            ];

            testCases.forEach(({ initial, newValue }) => {
                // Create an event and a reactive backed by it
                const [event, emit] = createTestEvent<number>();
                const reactive = R.create(initial, event);

                // Apply map(f ∘ g)
                const mapComposed = R.map(reactive, composed);

                // Apply map(f) ∘ map(g)
                const mapChained = R.map(R.map(reactive, g), f);

                // Check initial values
                expect(isEqual(R.get(mapComposed), R.get(mapChained))).toBe(
                    true,
                );

                // Track values from both approaches
                const composedValues: number[] = [];
                const chainedValues: number[] = [];

                const unsubComposed = R.subscribe(mapComposed, (value) => {
                    composedValues.push(value);
                });

                const unsubChained = R.subscribe(mapChained, (value) => {
                    chainedValues.push(value);
                });

                // Emit a new value
                emit(newValue);

                // Both should have received initial and new values
                expect(composedValues.length).toBe(2);
                expect(chainedValues.length).toBe(2);

                // Values should be equal at each corresponding position
                expect(isEqual(composedValues[0], chainedValues[0])).toBe(true);
                expect(isEqual(composedValues[1], chainedValues[1])).toBe(true);

                // Final values should match the expected composition result
                expect(composedValues[1]).toBe(f(g(newValue)));

                // Clean up
                unsubComposed();
                unsubChained();
            });
        });

        /**
         * Additional test: Multiple updates through events
         * Verifies that the functor laws continue to hold through a series of event emissions
         */
        it("maintains functor laws through multiple event emissions", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const reactive = R.create(5, event);

            // Define our functions
            const f = (x: number) => x * 2;
            const g = (x: number) => x + 3;

            // Map with both approaches
            const mapComposed = R.map(reactive, (x) => f(g(x)));
            const mapChained = R.map(R.map(reactive, g), f);

            // Track all values
            const composedValues: number[] = [];
            const chainedValues: number[] = [];

            const unsubComposed = R.subscribe(mapComposed, (value) => {
                composedValues.push(value);
            });

            const unsubChained = R.subscribe(mapChained, (value) => {
                chainedValues.push(value);
            });

            // Check initial values
            expect(R.get(mapComposed)).toBe(16); // (5 + 3) * 2
            expect(R.get(mapChained)).toBe(16);

            // Emit a sequence of values
            const newValues = [10, 7, 15, 0, -3];

            newValues.forEach((value) => {
                emit(value);

                // After each emission, both approaches should yield the same result
                expect(R.get(mapComposed)).toBe(f(g(value)));
                expect(R.get(mapChained)).toBe(f(g(value)));
            });

            // Both should have received the same number of values (initial + emissions)
            expect(composedValues.length).toBe(1 + newValues.length);
            expect(chainedValues.length).toBe(1 + newValues.length);

            // Values should match at each position
            for (let i = 0; i < composedValues.length; i++) {
                expect(composedValues[i]).toBe(chainedValues[i]);
            }

            // Clean up
            unsubComposed();
            unsubChained();
        });

        /**
         * Test for correct interaction between mapping and event unsubscription
         */
        it("correctly handles event unsubscription for mapped reactives", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const reactive = R.create(5, event);

            // Map the reactive
            const doubled = R.map(reactive, (x) => x * 2);

            // Track values
            const values: number[] = [];
            const unsubscribe = R.subscribe(doubled, (value) => {
                values.push(value);
            });

            // Initial value
            expect(values).toEqual([10]); // 5 * 2

            // Emit a new value
            emit(7);
            expect(values).toEqual([10, 14]); // Added 7 * 2

            // Clean up the original reactive
            unsubscribe();

            // Emit another value - should not be received due to cleanup
            emit(9);
            expect(values).toEqual([10, 14]); // No change
        });

        /**
         * Test for independence of multiple mapped reactives
         */
        it("maintains independence of multiple mapped reactives", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const reactive = R.create(5, event);

            // Create two different mappings
            const doubled = R.map(reactive, (x) => x * 2);
            const squared = R.map(reactive, (x) => x * x);

            // Track values from both
            const doubledValues: number[] = [];
            const squaredValues: number[] = [];

            const unsubDoubled = R.subscribe(doubled, (value) => {
                doubledValues.push(value);
            });

            const unsubSquared = R.subscribe(squared, (value) => {
                squaredValues.push(value);
            });

            // Check initial values
            expect(doubledValues).toEqual([10]); // 5 * 2
            expect(squaredValues).toEqual([25]); // 5 * 5

            // Emit new values
            emit(7);
            expect(doubledValues).toEqual([10, 14]); // Added 7 * 2
            expect(squaredValues).toEqual([25, 49]); // Added 7 * 7

            emit(3);
            expect(doubledValues).toEqual([10, 14, 6]); // Added 3 * 2
            expect(squaredValues).toEqual([25, 49, 9]); // Added 3 * 3

            // Clean up
            unsubDoubled();
            unsubSquared();
        });
    });

    /**
     * Tests for the Monad laws on Reactive values
     *
     * The three monad laws are:
     * 1. Left identity: return a >>= f ≡ f a
     * 2. Right identity: m >>= return ≡ m
     * 3. Associativity: (m >>= f) >>= g ≡ m >>= (\x -> f x >>= g)
     */
    describe("Monad Laws", () => {
        // Helper function for value comparison
        const assertReactiveEqual = <T>(
            a: R.Reactive<T>,
            b: R.Reactive<T>,
            message?: string,
        ) => {
            expect(R.get(a)).toEqual(R.get(b), message);
        };

        /**
         * Law 1: Left identity
         * return a >>= f ≡ f a
         *
         * In reactive terms:
         * R.chain(R.of(a), f) ≡ f(a)
         */
        it("satisfies the left identity law", () => {
            // Define a function that returns a reactive
            const f = (x: number) => R.of(x * 2);
            const g = (x: string) => R.of(x.toUpperCase());

            // Test with different values
            const testCases = [
                { value: 5, func: f },
                { value: 10, func: f },
                { value: "hello", func: g },
                { value: "world", func: g },
            ];

            testCases.forEach((testCase) => {
                // Left side of the equation: return a >>= f
                const left = R.chain(R.of(testCase.value), testCase.func);

                // Right side of the equation: f a
                const right = testCase.func(testCase.value);

                // They should be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Left identity failed for value: ${testCase.value}`,
                );
            });
        });

        /**
         * Law 2: Right identity
         * m >>= return ≡ m
         *
         * In reactive terms:
         * R.chain(m, R.of) ≡ m
         */
        it("satisfies the right identity law", () => {
            // Test with different reactive values
            const testCases = [
                R.of(42),
                R.of("hello"),
                R.of({ x: 1, y: 2 }),
                R.of([1, 2, 3]),
            ];

            testCases.forEach((m) => {
                // Left side of the equation: m >>= return
                const left = R.chain(m, R.of);

                // Right side of the equation: m
                const right = m;

                // They should be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Right identity failed for value: ${R.get(m)}`,
                );
            });
        });

        /**
         * Law 3: Associativity
         * (m >>= f) >>= g ≡ m >>= (\x -> f x >>= g)
         *
         * In reactive terms:
         * R.chain(R.chain(m, f), g) ≡ R.chain(m, x => R.chain(f(x), g))
         */
        it("satisfies the associativity law", () => {
            // Create a reactive value
            const m = R.of(5);

            // Define two functions that return reactives
            const f = (x: number) => R.of(x * 2);
            const g = (x: number) => R.of(x + 10);

            // Left side of the equation: (m >>= f) >>= g
            const left = R.chain(R.chain(m, f), g);

            // Right side of the equation: m >>= (\x -> f x >>= g)
            const right = R.chain(m, (x) => R.chain(f(x), g));

            // They should be equal
            assertReactiveEqual(left, right);

            // Test with more complex functions
            const h = (x: number) => R.of({ count: x });
            const j = (obj: { count: number }) =>
                R.of([obj.count, obj.count + 1]);

            const leftComplex = R.chain(R.chain(m, h), j);
            const rightComplex = R.chain(m, (x) => R.chain(h(x), j));

            assertReactiveEqual(leftComplex, rightComplex);
        });

        /**
         * Test that the laws hold when values change
         */
        it("maintains monad laws when values change", () => {
            // Create a reactive value that we'll update
            const reactive = R.create(5);

            // Define our functions
            const f = (x: number) => R.of(x * 2);
            const g = (x: number) => R.of(x + 10);

            // Left side of associativity: (m >>= f) >>= g
            const left = R.chain(R.chain(reactive, f), g);

            // Right side of associativity: m >>= (\x -> f x >>= g)
            const right = R.chain(reactive, (x) => R.chain(f(x), g));

            // Initial check
            assertReactiveEqual(left, right);

            // Update the reactive value
            (reactive as any).updateValueInternal(10);

            // Check after update
            assertReactiveEqual(left, right);
        });

        /**
         * Test that chain doesn't have side effects on the input
         */
        it("chain does not mutate the original reactive value", () => {
            const original = R.of(5);
            const f = (x: number) => R.of(x * 10);

            const chained = R.chain(original, f);

            // Original should be unchanged
            expect(R.get(original)).toBe(5);
            // Chained should have the transformed value
            expect(R.get(chained)).toBe(50);
        });

        /**
         * Test integration between monad operations and reactive updates
         */
        it("propagates updates through chained operations", () => {
            // Create a reactive value that we'll update
            const source = R.create(5);

            // Track values from chained results
            const chainResults: number[] = [];

            // Chain with a function
            const doubled = R.chain(source, (x) => R.of(x * 2));

            // Subscribe to the result
            const unsubscribe = R.subscribe(doubled, (value) => {
                chainResults.push(value);
            });

            // Should get initial value
            expect(chainResults).toEqual([10]);

            // Update source
            (source as any).updateValueInternal(7);
            expect(chainResults).toEqual([10, 14]);

            // Update again
            (source as any).updateValueInternal(12);
            expect(chainResults).toEqual([10, 14, 24]);

            // Clean up
            unsubscribe();
        });
    });

    /**
     * Tests for the Monad laws on Event-Backed Reactive values
     *
     * The three monad laws are:
     * 1. Left identity: return a >>= f ≡ f a
     * 2. Right identity: m >>= return ≡ m
     * 3. Associativity: (m >>= f) >>= g ≡ m >>= (\x -> f x >>= g)
     */
    describe("Event-Backed Reactive Monad Laws", () => {
        // Helper function to create test events
        function createTestEvent<A>(): [E.Event<A>, (value: A) => void] {
            return E.create<A>();
        }

        // Helper function for value comparison
        const assertReactiveEqual = <T>(
            a: R.Reactive<T>,
            b: R.Reactive<T>,
            message?: string,
        ) => {
            expect(R.get(a)).toEqual(R.get(b), message);
        };

        /**
         * Law 1: Left identity
         * return a >>= f ≡ f a
         *
         * In reactive terms:
         * R.chain(R.of(a), f) ≡ f(a)
         *
         * This should hold even when a comes from an event emission
         */
        it("satisfies the left identity law for event-backed reactives", () => {
            // Define functions that return a reactive
            const f = (x: number) => R.of(x * 2);
            const g = (x: string) => R.of(x.toUpperCase());

            // Test with different values
            const testCases = [
                { initial: 5, newValue: 8, func: f },
                { initial: 10, newValue: 15, func: f },
                { initial: "hello", newValue: "world", func: g },
                { initial: "reactive", newValue: "event", func: g },
            ];

            testCases.forEach((testCase) => {
                // Create an event and a reactive backed by it
                const [event, emit] =
                    createTestEvent<typeof testCase.initial>();
                const reactive = R.create(testCase.initial, event);

                // Left side of the equation: return a >>= f
                const left = R.chain(reactive, testCase.func);

                // Right side of the equation: f a
                const right = testCase.func(testCase.initial);

                // They should be equal initially
                assertReactiveEqual(
                    left,
                    right,
                    `Left identity failed for initial value: ${testCase.initial}`,
                );

                // Track values from both sides
                const leftValues: any[] = [];
                const rightInitialValue = R.get(right); // Store initial right value

                const unsubLeft = R.subscribe(left, (value) => {
                    leftValues.push(value);
                });

                // Emit a new value
                emit(testCase.newValue);

                // After emission, left should equal f(newValue)
                const expectedNewValue = R.get(
                    testCase.func(testCase.newValue),
                );
                expect(R.get(left)).toEqual(expectedNewValue);

                // leftValues should contain [f(initial), f(newValue)]
                expect(leftValues.length).toBe(2);
                expect(leftValues[0]).toEqual(
                    R.get(testCase.func(testCase.initial)),
                );
                expect(leftValues[1]).toEqual(expectedNewValue);

                // Clean up
                unsubLeft();
            });
        });

        /**
         * Law 2: Right identity
         * m >>= return ≡ m
         *
         * In reactive terms:
         * R.chain(m, R.of) ≡ m
         *
         * This should hold even when m is updated through event emissions
         */
        it("satisfies the right identity law for event-backed reactives", () => {
            // Test with different initial and new values
            const testCases = [
                { initial: 42, newValue: 99 },
                { initial: "hello", newValue: "world" },
                { initial: { x: 1, y: 2 }, newValue: { x: 3, y: 4 } },
                { initial: [1, 2, 3], newValue: [4, 5, 6] },
            ];

            testCases.forEach(({ initial, newValue }) => {
                // Create an event and a reactive backed by it
                const [event, emit] = createTestEvent<typeof initial>();
                const m = R.create(initial, event);

                // Left side of the equation: m >>= return
                const left = R.chain(m, R.of);

                // Right side of the equation: m
                const right = m;

                // They should be equal initially
                assertReactiveEqual(
                    left,
                    right,
                    `Right identity failed for initial value: ${JSON.stringify(initial)}`,
                );

                // Track values from both sides
                const leftValues: any[] = [];
                const rightValues: any[] = [];

                const unsubLeft = R.subscribe(left, (value) => {
                    leftValues.push(value);
                });

                const unsubRight = R.subscribe(right, (value) => {
                    rightValues.push(value);
                });

                // Emit a new value
                emit(newValue);

                // After emission, left and right should still be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Right identity failed after event emission with value: ${JSON.stringify(newValue)}`,
                );

                // Both should have received the same values
                expect(leftValues).toEqual(rightValues);

                // Clean up
                unsubLeft();
                unsubRight();
            });
        });

        /**
         * Law 3: Associativity
         * (m >>= f) >>= g ≡ m >>= (\x -> f x >>= g)
         *
         * In reactive terms:
         * R.chain(R.chain(m, f), g) ≡ R.chain(m, x => R.chain(f(x), g))
         *
         * This should hold when m is updated through event emissions
         */
        it("satisfies the associativity law for event-backed reactives", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const m = R.create(5, event);

            // Define two functions that return reactives
            const f = (x: number) => R.of(x * 2);
            const g = (x: number) => R.of(x + 10);

            // Left side of the equation: (m >>= f) >>= g
            const left = R.chain(R.chain(m, f), g);

            // Right side of the equation: m >>= (\x -> f x >>= g)
            const right = R.chain(m, (x) => R.chain(f(x), g));

            // They should be equal initially
            assertReactiveEqual(
                left,
                right,
                "Associativity failed for initial value",
            );

            // Track values from both sides
            const leftValues: number[] = [];
            const rightValues: number[] = [];

            const unsubLeft = R.subscribe(left, (value) => {
                leftValues.push(value);
            });

            const unsubRight = R.subscribe(right, (value) => {
                rightValues.push(value);
            });

            // Emit a series of new values
            const newValues = [8, 12, 3, 20];

            newValues.forEach((value) => {
                emit(value);

                // After each emission, left and right should still be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Associativity failed after event emission with value: ${value}`,
                );
            });

            // Both should have received the same values
            expect(leftValues).toEqual(rightValues);

            // Test with more complex functions
            const [complexEvent, emitComplex] = createTestEvent<number>();
            const complexM = R.create(5, complexEvent);

            const h = (x: number) => R.of({ count: x });
            const j = (obj: { count: number }) =>
                R.of([obj.count, obj.count + 1]);

            const leftComplex = R.chain(R.chain(complexM, h), j);
            const rightComplex = R.chain(complexM, (x) => R.chain(h(x), j));

            // Check initial equality
            assertReactiveEqual(
                leftComplex,
                rightComplex,
                "Complex associativity failed for initial value",
            );

            // Check after emissions
            emitComplex(10);
            assertReactiveEqual(
                leftComplex,
                rightComplex,
                "Complex associativity failed after event emission",
            );

            // Clean up
            unsubLeft();
            unsubRight();
        });

        /**
         * Test that the laws hold when values change through events
         */
        it("maintains monad laws when values change through events", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const reactive = R.create(5, event);

            // Define our functions
            const f = (x: number) => R.of(x * 2);
            const g = (x: number) => R.of(x + 10);

            // Left side of associativity: (m >>= f) >>= g
            const left = R.chain(R.chain(reactive, f), g);

            // Right side of associativity: m >>= (\x -> f x >>= g)
            const right = R.chain(reactive, (x) => R.chain(f(x), g));

            // Initial check
            assertReactiveEqual(left, right);

            // Track values
            const leftValues: number[] = [];
            const rightValues: number[] = [];

            const unsubLeft = R.subscribe(left, (value) => {
                leftValues.push(value);
            });

            const unsubRight = R.subscribe(right, (value) => {
                rightValues.push(value);
            });

            // Emit new values
            const testValues = [10, 15, 7, 22];

            testValues.forEach((value) => {
                emit(value);

                // Check after each update
                assertReactiveEqual(
                    left,
                    right,
                    `Monad laws failed after emitting value: ${value}`,
                );
            });

            // Both should have received identical sequences of values
            expect(leftValues).toEqual(rightValues);

            // Clean up
            unsubLeft();
            unsubRight();
        });

        /**
         * Test that chain doesn't have side effects on the input
         */
        it("chain does not mutate the original event-backed reactive", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const original = R.create(5, event);

            const f = (x: number) => R.of(x * 10);
            const chained = R.chain(original, f);

            // Original should have its initial value
            expect(R.get(original)).toBe(5);
            // Chained should have the transformed value
            expect(R.get(chained)).toBe(50);

            // After emission, original should update but not due to the chain operation
            emit(7);
            expect(R.get(original)).toBe(7);
            expect(R.get(chained)).toBe(70);
        });

        /**
         * Test integration between monad operations and event emissions
         */
        it("propagates event emissions through chained operations", () => {
            // Create an event and a reactive backed by it
            const [event, emit] = createTestEvent<number>();
            const source = R.create(5, event);

            // Track values from chained results
            const chainResults: number[] = [];

            // Chain with a function
            const doubled = R.chain(source, (x) => R.of(x * 2));

            // Subscribe to the result
            const unsubscribe = R.subscribe(doubled, (value) => {
                chainResults.push(value);
            });

            // Should get initial value
            expect(chainResults).toEqual([10]); // 5 * 2

            // Emit new values
            emit(7);
            expect(chainResults).toEqual([10, 14]); // Added 7 * 2

            emit(12);
            expect(chainResults).toEqual([10, 14, 24]); // Added 12 * 2

            // Clean up
            unsubscribe();
        });

        /**
         * Test chain with multiple event sources
         */
        it("handles chain with multiple event sources correctly", () => {
            // Create two events and reactives backed by them
            const [event1, emit1] = createTestEvent<number>();
            const [event2, emit2] = createTestEvent<string>();

            const numReactive = R.create(5, event1);

            // Define a function that uses the second event
            const createStringReactive = (n: number) => {
                const stringValue = `Number: ${n}`;
                return R.create(stringValue, event2);
            };

            // Chain the reactives
            const chained = R.chain(numReactive, createStringReactive);

            // Track values
            const values: string[] = [];
            const unsubscribe = R.subscribe(chained, (value) => {
                values.push(value);
            });

            // Check initial value
            expect(R.get(chained)).toBe("Number: 5");
            expect(values).toEqual(["Number: 5"]);

            // Emit from first event source
            emit1(10);
            expect(R.get(chained)).toBe("Number: 10");
            expect(values).toEqual(["Number: 5", "Number: 10"]);

            // Emit from second event source
            emit2("Updated string");
            expect(R.get(chained)).toBe("Updated string");
            expect(values).toEqual([
                "Number: 5",
                "Number: 10",
                "Updated string",
            ]);

            // Emit from both
            emit1(15);
            expect(R.get(chained)).toBe("Number: 15");
            expect(values).toEqual([
                "Number: 5",
                "Number: 10",
                "Updated string",
                "Number: 15",
            ]);

            emit2("Final string");
            expect(R.get(chained)).toBe("Final string");
            expect(values).toEqual([
                "Number: 5",
                "Number: 10",
                "Updated string",
                "Number: 15",
                "Final string",
            ]);

            // Clean up
            unsubscribe();
        });
    });

    /**
     * Tests for Applicative Functor laws on Reactive values
     *
     * The four applicative laws are:
     * 1. Identity: pure id <*> v ≡ v
     * 2. Homomorphism: pure f <*> pure x ≡ pure (f x)
     * 3. Interchange: u <*> pure y ≡ pure ($ y) <*> u
     * 4. Composition: pure (.) <*> u <*> v <*> w ≡ u <*> (v <*> w)
     */
    describe("Reactive Applicative Laws", () => {
        // Helper function for value comparison
        const assertReactiveEqual = <T>(
            a: R.Reactive<T>,
            b: R.Reactive<T>,
            message?: string,
        ) => {
            expect(R.get(a)).toEqual(R.get(b), message);
        };

        /**
         * Law 1: Identity
         * pure id <*> v ≡ v
         *
         * In reactive terms:
         * R.ap(R.of(x => x), v) ≡ v
         */
        it("satisfies the identity law", () => {
            // Define identity function
            const id = <T>(x: T) => x;

            // Test with different values
            const testCases = [
                R.of(5),
                R.of("hello"),
                R.of(true),
                R.of([1, 2, 3]),
                R.of({ a: 1, b: 2 }),
            ];

            testCases.forEach((v) => {
                // Left side: pure id <*> v
                const left = R.ap(v, R.of(id));

                // Right side: v
                const right = v;

                // They should be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Identity law failed for value: ${JSON.stringify(R.get(v))}`,
                );
            });
        });

        /**
         * Law 2: Homomorphism
         * pure f <*> pure x ≡ pure (f x)
         *
         * In reactive terms:
         * R.ap(R.of(x), R.of(f)) ≡ R.of(f(x))
         */
        it("satisfies the homomorphism law", () => {
            // Define a few functions to test
            const double = (x: number) => x * 2;
            const uppercase = (s: string) => s.toUpperCase();
            const addProperty = (o: object) => ({ ...o, extra: true });

            // Test cases combining functions and values
            const testCases = [
                { f: double, x: 5 },
                { f: double, x: 10 },
                { f: uppercase, x: "hello" },
                { f: uppercase, x: "world" },
                { f: addProperty, x: { name: "test" } },
            ];

            testCases.forEach(({ f, x }) => {
                // Left side: pure f <*> pure x
                const left = R.ap(R.of(x), R.of(f));

                // Right side: pure (f x)
                const right = R.of(f(x));

                // They should be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Homomorphism law failed for function and value: ${f.name}, ${JSON.stringify(x)}`,
                );
            });
        });

        /**
         * Law 3: Interchange
         * u <*> pure y ≡ pure ($ y) <*> u
         *
         * In reactive terms:
         * R.ap(R.of(y), u) ≡ R.ap(u, R.of(f => f(y)))
         */
        it("satisfies the interchange law", () => {
            // Define a few function values
            const doubleFn = R.of((x: number) => x * 2);
            const uppercaseFn = R.of((s: string) => s.toUpperCase());

            // Test cases with function values and simple values
            const testCases = [
                { u: doubleFn, y: 5 },
                { u: doubleFn, y: 10 },
                { u: uppercaseFn, y: "hello" },
                { u: uppercaseFn, y: "world" },
            ];

            testCases.forEach(({ u, y }) => {
                // Left side: u <*> pure y
                const left = R.ap(R.of(y), u);

                // Right side: pure ($ y) <*> u
                // Note: ($ y) is Haskell for a function that applies y to its argument
                // In JavaScript, we write it as f => f(y)
                const applyY = (f: Function) => f(y);
                const right = R.ap(u, R.of(applyY));

                // They should be equal
                assertReactiveEqual(
                    left,
                    right,
                    `Interchange law failed for function and value: ${u}, ${y}`,
                );
            });
        });

        /**
         * Law 4: Composition
         * pure (.) <*> u <*> v <*> w ≡ u <*> (v <*> w)
         *
         * In reactive terms, where (.) is function composition:
         * R.ap(R.ap(R.ap(R.of(f => g => x => f(g(x))), u), v), w) ≡ R.ap(w, R.ap(v, u))
         */
        it("satisfies the composition law", () => {
            // Define the composition function: (.) in Haskell
            const compose = (f: Function) => (g: Function) => (x: any) =>
                f(g(x));

            // Define some simple functions to compose
            const double = (x: number) => x * 2;
            const addTen = (x: number) => x + 10;
            const square = (x: number) => x * x;

            // Wrap these in reactive values
            const u = R.of(double);
            const v = R.of(addTen);
            const w = R.of(5);

            // Left side: pure (.) <*> u <*> v <*> w
            const left = R.ap(w, R.ap(v, R.ap(u, R.of(compose))));

            // Right side: u <*> (v <*> w)
            const right = R.ap(R.ap(w, v), u);

            // They should be equal
            assertReactiveEqual(left, right, "Composition law failed");

            // Test with different functions and values
            const u2 = R.of(square);
            const v2 = R.of(double);
            const w2 = R.of(3);

            const left2 = R.ap(w2, R.ap(v2, R.ap(u2, R.of(compose))));
            const right2 = R.ap(R.ap(w2, v2), u2);

            assertReactiveEqual(
                left2,
                right2,
                "Composition law failed for second test case",
            );
        });

        /**
         * Test that the laws hold when values change
         */
        it("maintains applicative laws when values change", () => {
            // Create reactive values that we'll update
            const reactiveValue = R.create(5);
            const reactiveFunc = R.create((x: number) => x * 2);

            // Check identity law
            const identity = (x: any) => x;
            const identityResult = R.ap(reactiveValue, R.of(identity));

            // Initial check
            expect(R.get(identityResult)).toBe(5);

            // Update the value
            (reactiveValue as any).updateValueInternal(10);

            // Check after update
            expect(R.get(identityResult)).toBe(10);

            // Check the homomorphism law with changing values
            const homomorphismLeft = R.ap(reactiveValue, reactiveFunc);

            // Update the function
            (reactiveFunc as any).updateValueInternal((x: number) => x * 3);

            // Result should reflect the updated function
            expect(R.get(homomorphismLeft)).toBe(30); // 10 * 3
        });

        /**
         * Test that ap combines updates from both sources
         */
        it("propagates updates from both function and value sources", () => {
            // Create reactive values that we'll update
            const reactiveValue = R.create(5);
            const reactiveFunc = R.create((x: number) => x * 2);

            // Apply the function to the value
            const result = R.ap(reactiveValue, reactiveFunc);

            // Track values from the result
            const resultValues: number[] = [];
            const unsubscribe = R.subscribe(result, (value) => {
                resultValues.push(value);
            });

            // Should have initial value
            expect(resultValues).toEqual([10]); // 5 * 2

            // Update the value
            (reactiveValue as any).updateValueInternal(7);
            expect(resultValues).toEqual([10, 14]); // Added 7 * 2

            // Update the function
            (reactiveFunc as any).updateValueInternal((x: number) => x * 3);
            expect(resultValues).toEqual([10, 14, 21]); // Added 7 * 3

            // Update both
            (reactiveValue as any).updateValueInternal(9);
            expect(resultValues).toEqual([10, 14, 21, 27]); // Added 9 * 3

            // Clean up
            unsubscribe();
        });

        /**
         * Test that ap doesn't have side effects on the inputs
         */
        it("ap does not mutate the original reactive values", () => {
            const originalValue = R.of(5);
            const originalFunc = R.of((x: number) => x * 10);

            const applied = R.ap(originalValue, originalFunc);

            // Originals should be unchanged
            expect(R.get(originalValue)).toBe(5);
            expect(R.get(originalFunc)(5)).toBe(50);

            // Applied should have the transformed value
            expect(R.get(applied)).toBe(50);
        });
    });

    /**
     * Tests for Applicative Functor laws on Event-Backed Reactive values
     *
     * The four applicative laws are:
     * 1. Identity: pure id <*> v ≡ v
     * 2. Homomorphism: pure f <*> pure x ≡ pure (f x)
     * 3. Interchange: u <*> pure y ≡ pure ($ y) <*> u
     * 4. Composition: pure (.) <*> u <*> v <*> w ≡ u <*> (v <*> w)
     */
    describe("Event-Backed Reactive Applicative Laws", () => {
        // Helper function to create test events
        function createTestEvent<A>(): [E.Event<A>, (value: A) => void] {
            return E.create<A>();
        }

        // Helper function for value comparison
        const assertReactiveEqual = <T>(
            a: R.Reactive<T>,
            b: R.Reactive<T>,
            message?: string,
        ) => {
            expect(R.get(a)).toEqual(R.get(b), message);
        };

        /**
         * Law 1: Identity
         * pure id <*> v ≡ v
         *
         * In reactive terms:
         * R.ap(R.of(x => x), v) ≡ v
         */
        it("satisfies the identity law for event-backed reactives", () => {
            // Define identity function
            const id = <T>(x: T) => x;

            // Test with different value types and events
            const testCases = [
                { initial: 5, newValue: 10 },
                { initial: "hello", newValue: "world" },
                { initial: true, newValue: false },
                { initial: [1, 2, 3], newValue: [4, 5, 6] },
                { initial: { a: 1, b: 2 }, newValue: { a: 3, b: 4 } },
            ];

            testCases.forEach(({ initial, newValue }) => {
                // Create event and reactive
                const [event, emit] = createTestEvent<typeof initial>();
                const v = R.create(initial, event);

                // Left side: pure id <*> v
                const left = R.ap(v, R.of(id));

                // Right side: v
                const right = v;

                // They should be equal initially
                assertReactiveEqual(
                    left,
                    right,
                    `Identity law failed for initial value: ${JSON.stringify(initial)}`,
                );

                // Track values from both sides
                const leftValues: any[] = [];
                const rightValues: any[] = [];

                const unsubLeft = R.subscribe(left, (value) => {
                    leftValues.push(value);
                });

                const unsubRight = R.subscribe(right, (value) => {
                    rightValues.push(value);
                });

                // Emit a new value
                emit(newValue);

                // They should still be equal after the event
                assertReactiveEqual(
                    left,
                    right,
                    `Identity law failed for value after event: ${JSON.stringify(newValue)}`,
                );

                // Both should have received the same values in the same order
                expect(leftValues).toEqual(rightValues);

                // Clean up
                unsubLeft();
                unsubRight();
            });
        });

        /**
         * Law 2: Homomorphism
         * pure f <*> pure x ≡ pure (f x)
         *
         * In reactive terms:
         * R.ap(R.of(x), R.of(f)) ≡ R.of(f(x))
         *
         * For event-backed reactives, we need to test both with
         * static pure values and with event-backed reactives
         */
        it("satisfies the homomorphism law with event-backed reactives", () => {
            // Define functions to test
            const double = (x: number) => x * 2;
            const uppercase = (s: string) => s.toUpperCase();
            const addProperty = (o: object) => ({ ...o, extra: true });

            // Test cases combining functions and values
            const testCases = [
                { f: double, initial: 5, newValue: 10 },
                { f: double, initial: 7, newValue: 15 },
                { f: uppercase, initial: "hello", newValue: "world" },
                { f: uppercase, initial: "test", newValue: "event" },
                {
                    f: addProperty,
                    initial: { name: "test" },
                    newValue: { name: "updated" },
                },
            ];

            testCases.forEach(({ f, initial, newValue }) => {
                // Create events for both function and value
                const [valueEvent, emitValue] =
                    createTestEvent<typeof initial>();
                const [funcEvent, emitFunc] = createTestEvent<typeof f>();

                // Create event-backed reactives
                const xReactive = R.create(initial, valueEvent);
                const fReactive = R.create(f, funcEvent);

                // Test 1: pure f <*> pure x (with one reactive from event)
                const left1 = R.ap(R.of(initial), fReactive);
                const right1 = R.of(f(initial));

                // They should be equal initially
                assertReactiveEqual(
                    left1,
                    right1,
                    `Homomorphism law 1 failed for initial ${JSON.stringify(initial)}`,
                );

                // Test 2: pure f <*> pure x (with other reactive from event)
                const left2 = R.ap(xReactive, R.of(f));
                const right2 = R.of(f(initial));

                // They should be equal initially
                assertReactiveEqual(
                    left2,
                    right2,
                    `Homomorphism law 2 failed for initial ${JSON.stringify(initial)}`,
                );

                // Test 3: Both from events
                const left3 = R.ap(xReactive, fReactive);
                const right3 = R.of(f(initial));

                // They should be equal initially
                assertReactiveEqual(
                    left3,
                    right3,
                    `Homomorphism law 3 failed for initial ${JSON.stringify(initial)}`,
                );

                // Track values from the third case
                const left3Values: any[] = [];
                const unsubLeft3 = R.subscribe(left3, (value) => {
                    left3Values.push(value);
                });

                // Emit new value
                emitValue(newValue);

                // After value update, should be f(newValue)
                expect(R.get(left3)).toEqual(f(newValue));

                // Create a modified function for testing
                const modifiedF =
                    typeof f === "function" && f.name === "double"
                        ? (x: number) => x * 3
                        : typeof f === "function" && f.name === "uppercase"
                          ? (s: string) => s.toLowerCase()
                          : (o: object) => ({ ...o, extraModified: true });

                // Emit new function
                emitFunc(modifiedF);

                // After function update, should be modifiedF(newValue)
                expect(R.get(left3)).toEqual(modifiedF(newValue));

                // Clean up
                unsubLeft3();
            });
        });

        /**
         * Law 3: Interchange
         * u <*> pure y ≡ pure ($ y) <*> u
         *
         * In reactive terms:
         * R.ap(R.of(y), u) ≡ R.ap(u, R.of(f => f(y)))
         */
        it("satisfies the interchange law for event-backed reactives", () => {
            // Define function values to test
            const testCases = [
                {
                    initial: (x: number) => x * 2,
                    newF: (x: number) => x * 3,
                    y: 5,
                },
                {
                    initial: (x: number) => x + 10,
                    newF: (x: number) => x + 20,
                    y: 7,
                },
                {
                    initial: (s: string) => s.toUpperCase(),
                    newF: (s: string) => s.toLowerCase(),
                    y: "hello",
                },
                {
                    initial: (s: string) => s + "!",
                    newF: (s: string) => s + "?",
                    y: "world",
                },
            ];

            testCases.forEach(({ initial, newF, y }) => {
                // Create an event and a reactive function backed by it
                const [event, emit] = createTestEvent<typeof initial>();
                const u = R.create(initial, event);

                // Left side: u <*> pure y
                const left = R.ap(R.of(y), u);

                // Right side: pure ($ y) <*> u
                // Note: ($ y) in Haskell is a function that applies y to its argument
                // In JavaScript, we write it as f => f(y)
                const applyY = (f: Function) => f(y);
                const right = R.ap(u, R.of(applyY));

                // They should be equal initially
                assertReactiveEqual(
                    left,
                    right,
                    `Interchange law failed for initial function and value: ${initial.name}, ${y}`,
                );

                // Track values from both sides
                const leftValues: any[] = [];
                const rightValues: any[] = [];

                const unsubLeft = R.subscribe(left, (value) => {
                    leftValues.push(value);
                });

                const unsubRight = R.subscribe(right, (value) => {
                    rightValues.push(value);
                });

                // Emit a new function
                emit(newF);

                // They should still be equal after the event
                assertReactiveEqual(
                    left,
                    right,
                    `Interchange law failed after event with function: ${newF.name}`,
                );

                // Both should have received the same values in the same order
                expect(leftValues).toEqual(rightValues);

                // Clean up
                unsubLeft();
                unsubRight();
            });
        });

        /**
         * Law 4: Composition
         * pure (.) <*> u <*> v <*> w ≡ u <*> (v <*> w)
         *
         * In reactive terms, where (.) is function composition:
         * R.ap(R.ap(R.ap(R.of(f => g => x => f(g(x))), u), v), w) ≡ R.ap(w, R.ap(v, u))
         */
        it("satisfies the composition law for event-backed reactives", () => {
            // Define the composition function: (.) in Haskell
            const compose = (f: Function) => (g: Function) => (x: any) =>
                f(g(x));

            // Create events for each component
            const [eventU, emitU] = createTestEvent<(x: number) => number>();
            const [eventV, emitV] = createTestEvent<(x: number) => number>();
            const [eventW, emitW] = createTestEvent<number>();

            // Define functions to test
            const double = (x: number) => x * 2;
            const addTen = (x: number) => x + 10;
            const square = (x: number) => x * x;

            // Create event-backed reactives
            const u = R.create(double, eventU);
            const v = R.create(addTen, eventV);
            const w = R.create(5, eventW);

            // Left side: pure (.) <*> u <*> v <*> w
            const left = R.ap(w, R.ap(v, R.ap(u, R.of(compose))));

            // Right side: u <*> (v <*> w)
            const right = R.ap(R.ap(w, v), u);

            // They should be equal initially
            assertReactiveEqual(
                left,
                right,
                "Composition law failed for initial values",
            );

            // Track values from both sides
            const leftValues: number[] = [];
            const rightValues: number[] = [];

            const unsubLeft = R.subscribe(left, (value) => {
                leftValues.push(value);
            });

            const unsubRight = R.subscribe(right, (value) => {
                rightValues.push(value);
            });

            // Emit new values for each component
            emitW(8);
            assertReactiveEqual(
                left,
                right,
                "Composition law failed after updating w",
            );

            emitV((x: number) => x + 5);
            assertReactiveEqual(
                left,
                right,
                "Composition law failed after updating v",
            );

            emitU((x: number) => x * 3);
            assertReactiveEqual(
                left,
                right,
                "Composition law failed after updating u",
            );

            // Both should have received the same values in the same order
            expect(leftValues).toEqual(rightValues);

            // Test with entirely different functions
            const [eventU2, emitU2] = createTestEvent<(x: number) => number>();
            const [eventV2, emitV2] = createTestEvent<(x: number) => number>();
            const [eventW2, emitW2] = createTestEvent<number>();

            const u2 = R.create(square, eventU2);
            const v2 = R.create(double, eventV2);
            const w2 = R.create(3, eventW2);

            const left2 = R.ap(w2, R.ap(v2, R.ap(u2, R.of(compose))));
            const right2 = R.ap(R.ap(w2, v2), u2);

            assertReactiveEqual(
                left2,
                right2,
                "Composition law failed for second test case",
            );

            // Clean up
            unsubLeft();
            unsubRight();
        });

        /**
         * Test that the laws hold when values change through events
         */
        it("maintains applicative laws when values change through events", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [funcEvent, emitFunc] =
                createTestEvent<(x: number) => number>();

            // Create event-backed reactives
            const reactiveValue = R.create(5, valueEvent);
            const reactiveFunc = R.create((x: number) => x * 2, funcEvent);

            // Check identity law
            const identity = <T>(x: T) => x;
            const identityResult = R.ap(reactiveValue, R.of(identity));

            // Initial check
            expect(R.get(identityResult)).toBe(5);

            // Emit a new value
            emitValue(10);

            // Check after update
            expect(R.get(identityResult)).toBe(10);

            // Check the homomorphism law with changing values
            const homomorphismLeft = R.ap(reactiveValue, reactiveFunc);

            // Emit a new function
            emitFunc((x: number) => x * 3);

            // Result should reflect the updated function
            expect(R.get(homomorphismLeft)).toBe(30); // 10 * 3

            // Emit a new value again
            emitValue(15);

            // Result should reflect both updated value and function
            expect(R.get(homomorphismLeft)).toBe(45); // 15 * 3
        });

        /**
         * Test that ap combines updates from both event sources
         */
        it("propagates updates from both event-backed function and value sources", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [funcEvent, emitFunc] =
                createTestEvent<(x: number) => number>();

            // Create event-backed reactives
            const reactiveValue = R.create(5, valueEvent);
            const reactiveFunc = R.create((x: number) => x * 2, funcEvent);

            // Apply the function to the value
            const result = R.ap(reactiveValue, reactiveFunc);

            // Track values from the result
            const resultValues: number[] = [];
            const unsubscribe = R.subscribe(result, (value) => {
                resultValues.push(value);
            });

            // Should have initial value
            expect(resultValues).toEqual([10]); // 5 * 2

            // Emit a new value
            emitValue(7);
            expect(resultValues).toEqual([10, 14]); // Added 7 * 2

            // Emit a new function
            emitFunc((x: number) => x * 3);
            expect(resultValues).toEqual([10, 14, 21]); // Added 7 * 3

            // Emit new value and function in succession
            emitValue(9);
            expect(resultValues).toEqual([10, 14, 21, 27]); // Added 9 * 3

            emitFunc((x: number) => x * 4);
            expect(resultValues).toEqual([10, 14, 21, 27, 36]); // Added 9 * 4

            // Clean up
            unsubscribe();
        });

        /**
         * Test that ap doesn't have side effects on the inputs
         */
        it("ap does not mutate the original event-backed reactive values", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [funcEvent, emitFunc] =
                createTestEvent<(x: number) => number>();

            // Create event-backed reactives
            const originalValue = R.create(5, valueEvent);
            const originalFunc = R.create((x: number) => x * 10, funcEvent);

            const applied = R.ap(originalValue, originalFunc);

            // Originals should have their initial values
            expect(R.get(originalValue)).toBe(5);
            expect(R.get(originalFunc)(5)).toBe(50);

            // Applied should have the transformed value
            expect(R.get(applied)).toBe(50);

            // After emitting, original values should update independently
            emitValue(7);
            emitFunc((x: number) => x * 20);

            // Check that originals were updated
            expect(R.get(originalValue)).toBe(7);
            expect(R.get(originalFunc)(5)).toBe(100);

            // Applied should reflect both updates
            expect(R.get(applied)).toBe(140); // 7 * 20
        });

        /**
         * Test applicative laws with cleanup handling
         */
        it("correctly handles cleanup of event subscriptions in applicatives", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [funcEvent, emitFunc] =
                createTestEvent<(x: number) => number>();

            // Create event-backed reactives
            const reactiveValue = R.create(5, valueEvent);
            const reactiveFunc = R.create((x: number) => x * 2, funcEvent);

            // Apply the function to the value
            const result = R.ap(reactiveValue, reactiveFunc);

            // Track values
            const values: number[] = [];
            const unsubscribe = R.subscribe(result, (value) => {
                values.push(value);
            });

            // Should have initial value
            expect(values).toEqual([10]); // 5 * 2

            // Clean up the function reactive
            R.cleanup(reactiveFunc);

            // Emit a new function - should be ignored
            emitFunc((x: number) => x * 3);

            // Result should still reflect the last value before cleanup
            expect(R.get(result)).toBe(10); // Still 5 * 2

            // Emit a new value - should still update with the last function
            emitValue(7);
            expect(values).toEqual([10, 14]); // 5*2, 7*2

            unsubscribe();

            // Emit a new value - should be ignored
            emitValue(9);

            // Result should still reflect the last values before cleanup
            expect(values).toEqual([10, 14]); // No change
        });
    });

    describe("subscribe()", () => {
        /**
         *
         * Test for subscribe functionality in reactive values
         */
        it("notifies subscribers when values change", () => {
            // Create a reactive value
            const reactive = R.create(10);

            // Track notifications with multiple subscribers
            const notifications1: number[] = [];
            const notifications2: number[] = [];

            // Subscribe to changes
            const unsubscribe1 = R.subscribe(reactive, (value) => {
                notifications1.push(value);
            });

            // Initial value should be pushed immediately
            expect(notifications1).toEqual([10]);

            // Update the value
            (reactive as any).updateValueInternal(20);
            expect(notifications1).toEqual([10, 20]);

            // Add a second subscriber
            const unsubscribe2 = R.subscribe(reactive, (value) => {
                notifications2.push(value);
            });

            // Second subscriber should get the current value immediately
            expect(notifications2).toEqual([20]);

            // Update again, both subscribers should be notified
            (reactive as any).updateValueInternal(30);
            expect(notifications1).toEqual([10, 20, 30]);
            expect(notifications2).toEqual([20, 30]);

            // Unsubscribe the first subscriber
            unsubscribe1();

            // Update again
            (reactive as any).updateValueInternal(40);

            // First subscriber should not receive the update
            expect(notifications1).toEqual([10, 20, 30]);
            // Second subscriber should still receive updates
            expect(notifications2).toEqual([20, 30, 40]);

            // Unsubscribe the second subscriber
            unsubscribe2();

            // Update again
            (reactive as any).updateValueInternal(50);

            // Neither subscriber should receive the update
            expect(notifications1).toEqual([10, 20, 30]);
            expect(notifications2).toEqual([20, 30, 40]);
        });

        /**
         * Test for error handling in subscribers
         */
        it("continues notifying other subscribers when one throws an error", () => {
            // Create a reactive value
            const reactive = R.create(5);

            // Track values received by the well-behaved subscriber
            const receivedValues: number[] = [];

            // Mock console.error to prevent test output pollution
            const consoleErrorSpy = vi
                .spyOn(console, "error")
                .mockImplementation(() => {});

            // Subscribe with a function that will throw on certain values
            const unsubscribe1 = R.subscribe(reactive, (value) => {
                if (value === 15) {
                    throw new Error("Test error in subscriber");
                }
            });

            // Subscribe with a well-behaved function
            const unsubscribe2 = R.subscribe(reactive, (value) => {
                receivedValues.push(value);
            });

            // Update with a value that will cause the first subscriber to throw
            (reactive as any).updateValueInternal(15);

            // The second subscriber should still have received the update
            expect(receivedValues).toContain(15);

            // Update with another value
            (reactive as any).updateValueInternal(20);

            // The second subscriber should continue receiving updates
            expect(receivedValues).toContain(20);

            // Clean up
            unsubscribe1();
            unsubscribe2();
            consoleErrorSpy.mockRestore();
        });

        /**
         * Test for cleanup functionality
         */
        it("cleans up subscribers properly", () => {
            // Create a reactive value
            const reactive = R.create("test");

            // Track values
            const values1: string[] = [];
            const values2: string[] = [];

            // Add subscribers
            R.subscribe(reactive, (value) => {
                values1.push(value);
            });

            R.subscribe(reactive, (value) => {
                values2.push(value);
            });

            // Initial values
            expect(values1).toEqual(["test"]);
            expect(values2).toEqual(["test"]);

            // Update
            (reactive as any).updateValueInternal("updated");
            expect(values1).toEqual(["test", "updated"]);
            expect(values2).toEqual(["test", "updated"]);

            // Clean up all subscribers
            R.cleanup(reactive);

            // Update again
            (reactive as any).updateValueInternal("final");

            // No subscribers should receive updates after cleanup
            expect(values1).toEqual(["test", "updated"]);
            expect(values2).toEqual(["test", "updated"]);

            // Check that subscribers array is empty
            expect((reactive as any).subscribers.length).toBe(0);
        });
    });

    describe("Event-Backed Reactive Values", () => {
        // Helper function to create test events
        function createTestEvent<A>(): [E.Event<A>, (value: A) => void] {
            return E.create<A>();
        }

        it("should initialize with the correct value", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event with an initial value
            const reactive = R.create(10, event);

            // Check the initial value
            expect(R.get(reactive)).toBe(10);
        });

        it("should update when the backing event emits", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Emit a value on the event
            emit(10);

            // Check that the reactive value was updated
            expect(R.get(reactive)).toBe(10);

            // Emit another value
            emit(15);

            // Check that the reactive value was updated again
            expect(R.get(reactive)).toBe(15);
        });

        it("should notify subscribers when the backing event emits", () => {
            // Create an event
            const [event, emit] = createTestEvent<string>();

            // Create a reactive backed by the event
            const reactive = R.create("initial", event);

            // Track notifications
            const values: string[] = [];
            const unsubscribe = R.subscribe(reactive, (value) => {
                values.push(value);
            });

            // Should get initial value immediately
            expect(values).toEqual(["initial"]);

            // Emit values on the event
            emit("update 1");
            emit("update 2");

            // Should get all values
            expect(values).toEqual(["initial", "update 1", "update 2"]);

            unsubscribe();
        });

        it("should support map on event-backed reactives", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Map the reactive
            const doubled = R.map(reactive, (x) => x * 2);

            // Check initial value
            expect(R.get(doubled)).toBe(10);

            // Emit a value on the event
            emit(7);

            // Check that the mapped reactive was updated
            expect(R.get(doubled)).toBe(14);
        });

        it("should support ap on event-backed reactives", () => {
            // Create events
            const [valueEvent, emitValue] = createTestEvent<number>();
            const [funcEvent, emitFunc] =
                createTestEvent<(n: number) => number>();

            // Create reactives backed by events
            const value = R.create(5, valueEvent);
            const func = R.create((x: number) => x * 2, funcEvent);

            // Apply the function to the value
            const result = R.ap(value, func);

            // Check initial value
            expect(R.get(result)).toBe(10);

            // Emit a new value
            emitValue(7);
            expect(R.get(result)).toBe(14);

            // Emit a new function
            emitFunc((x: number) => x * 3);
            expect(R.get(result)).toBe(21);

            // Emit both a new value and function
            emitValue(10);
            expect(R.get(result)).toBe(30);
        });

        it("should support chain on event-backed reactives", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Chain the reactive with a function that returns another reactive
            const result = R.chain(reactive, (x) => {
                const innerEvent = E.create<number>()[0];
                return R.create(x * 2, innerEvent);
            });

            // Check initial value
            expect(R.get(result)).toBe(10);

            // Emit a value on the event
            emit(7);

            // Check that the chained reactive was updated
            expect(R.get(result)).toBe(14);
        });

        it("should support nested event-backed reactives", () => {
            // Create events
            const [outerEvent, emitOuter] = createTestEvent<number>();
            const [innerEvent, emitInner] = createTestEvent<number>();

            // Create a reactive backed by the outer event
            const outer = R.create(5, outerEvent);

            // Create a reactive backed by the inner event
            const inner = R.create(10, innerEvent);

            // Combine them
            const combined = R.ap(
                outer,
                R.map(inner, (a) => (b: number) => a + b),
            );

            // Check initial value
            expect(R.get(combined)).toBe(15); // 5 + 10

            // Emit a value on the inner event
            emitInner(20);

            // Check that the combined reactive was updated
            expect(R.get(combined)).toBe(25); // 5 + 20

            // Emit a value on the outer event
            emitOuter(7);

            // Check that the combined reactive was updated
            expect(R.get(combined)).toBe(27); // 7 + 20
        });

        it("should clean up event subscriptions", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Track updates
            const values: number[] = [];
            const unsubscribe = R.subscribe(reactive, (value) => {
                values.push(value);
            });

            // Emit a value
            emit(10);
            expect(values).toEqual([5, 10]);

            // Clean up the reactive
            R.cleanup(reactive);

            // Emit another value - should not be received since we cleaned up
            emit(15);
            expect(values).toEqual([5, 10]);

            // For good measure, also unsubscribe our own subscriber
            unsubscribe();
        });

        it("should propagate through a chain of mapped event-backed reactives", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Create a chain of mapped reactives
            const doubled = R.map(reactive, (x) => x * 2);
            const plusTen = R.map(doubled, (x) => x + 10);
            const squared = R.map(plusTen, (x) => x * x);

            // Track values from the final reactive
            const values: number[] = [];
            const unsubscribe = R.subscribe(squared, (value) => {
                values.push(value);
            });

            // Should have initial value
            expect(values).toEqual([400]); // (5*2 + 10)^2 = 20^2 = 400

            // Emit a value
            emit(7);
            expect(values).toEqual([400, 576]); // (7*2 + 10)^2 = 24^2 = 576

            // Emit another value
            emit(10);
            expect(values).toEqual([400, 576, 900]); // (10*2 + 10)^2 = 30^2 = 900

            // Clean up
            unsubscribe();
        });

        it("should satisfy functor laws with event-backed reactives", () => {
            // Create an event
            const [event, emit] = createTestEvent<number>();

            // Create a reactive backed by the event
            const reactive = R.create(5, event);

            // Test identity law: map(id) === id
            const identity = R.map(reactive, (x) => x);
            expect(R.get(identity)).toBe(5);

            // Emit a value
            emit(10);
            expect(R.get(identity)).toBe(10);
            expect(R.get(reactive)).toBe(10);

            // Test composition law: map(f . g) === map(f) . map(g)
            const f = (x: number) => x * 2;
            const g = (x: number) => x + 10;

            const composed = R.map(reactive, (x) => f(g(x)));
            const chained = R.map(R.map(reactive, g), f);

            expect(R.get(composed)).toBe(f(g(10))); // (10+10)*2 = 40
            expect(R.get(chained)).toBe(f(g(10))); // (10+10)*2 = 40

            // Emit another value
            emit(15);
            expect(R.get(composed)).toBe(f(g(15))); // (15+10)*2 = 50
            expect(R.get(chained)).toBe(f(g(15))); // (15+10)*2 = 50
        });
    });
});