import { Event, stepper, create, mergeWith } from './event';
import { Reactive } from './reactive';

/**
 * Fixed-point combinator for creating recursive reactive values.
 * Similar to Haskell's mdo (recursive do-notation).
 *
 * Exploits the circular structure:
 *   Reactive a = initial `Stepper` Event a
 *   Event a = Ev (Future (Reactive a))
 *
 * This allows us to create a Reactive that depends on Events derived from itself,
 * enabling patterns like:
 * - Input fields that clear themselves after submission
 * - Counters that reference their own value
 * - Any reactive value that needs circular dependency
 *
 * @param initial - The initial value of the reactive
 * @param fn - Function that receives the reactive being constructed and returns
 *             the event stream that will update it. The function should wire up
 *             event streams but not immediately evaluate the reactive's value.
 *
 * @example
 * // Input value that clears after submission
 * const [clearEvent, emitClear] = E.create<void>();
 * const inputValue = fix("", (reactive) => {
 *   // Wire up the clear event - don't immediately read reactive
 *   return E.map(clearEvent, () => "");
 * });
 *
 * @note The reactive parameter in fn is a forward reference. You can use it
 *       for wiring event streams, but calling get(reactive) immediately will fail
 *       since the reactive isn't fully constructed yet. This is fine for most
 *       use cases where events only fire after construction is complete.
 */
export function fix<A>(
  initial: A,
  fn: (reactive: Reactive<A>) => Event<A>
): Reactive<A> {
  // Forward declaration - safe because Event/Future is lazy
  let reactive: Reactive<A> = undefined as any;

  // Create the event that updates the reactive
  // This works because fn doesn't immediately force evaluation of reactive
  const event = fn(reactive);

  // Now construct the reactive from the event
  reactive = stepper(event, initial);

  return reactive;
}

/**
 * Extended fix that takes a builder function which receives the reactive being constructed
 * and returns both a result and the update event.
 *
 * This allows you to define circular dependencies where:
 * - The reactive is used to create something (like a DOM element)
 * - That something produces events
 * - Those events determine how to update the reactive
 *
 * @param initial - The initial value of the reactive
 * @param builder - Function that receives the reactive (forward reference) and returns
 *                  both a result and the update event for the reactive
 *
 * @example
 * // Input that clears after validation
 * const { reactive: inputValue, result: inputEl } = fixWith<string, HTMLInputElement>("", (value) => {
 *   const inputEl = input({ value });
 *   const keydown = on(inputEl, "keydown");
 *   const validTitle = E.filter(E.map(keydown, () => inputEl.value), ...);
 *
 *   return {
 *     result: inputEl,
 *     update: E.map(validTitle, () => "")
 *   };
 * });
 */
export function fixWith<A, B>(
  initial: A,
  builder: (reactive: Reactive<A>) => {
    result: B;
    update: Event<A>;
  }
): {
  reactive: Reactive<A>;
  result: B;
} {
  // Forward declaration - same as in fix()
  let reactive: Reactive<A> = undefined as any;

  // Run builder with forward reference
  const { result, update } = builder(reactive);

  // Now construct the reactive from the update event
  reactive = stepper(update, initial);

  return { reactive, result };
}
