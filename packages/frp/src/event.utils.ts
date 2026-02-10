import type { Event } from './event';
import * as E from './event';
import * as R from './reactive';
import type { Reactive } from './reactive';

/**
 * Map events to constant values, merge them, and create a Reactive with state transitions.
 * This is a common pattern for state machines where different events trigger specific state changes.
 *
 * Inspired by RxJS/Cycle.js patterns like `merge(eventA.pipe(mapTo(valueA)), eventB.pipe(mapTo(valueB)))`.
 * In Synx, this is expressed more concisely as `mapMerge([[eventA, valueA], [eventB, valueB]], initial)`.
 *
 * @param transitions Array of [event, value] pairs. Each event will trigger a transition to its associated value.
 * @param initial Initial state value
 * @returns A Reactive that updates to the specified value whenever any of the events fire
 *
 * @example
 * // Boolean state machine
 * const isEditing = E.mapMerge([
 *   [startEdit, true],
 *   [cancelEdit, false],
 *   [saveEdit, false]
 * ], false);
 *
 * @example
 * // Enum state transitions
 * type LoadState = "idle" | "loading" | "success" | "error";
 * const loadState = E.mapMerge<LoadState>([
 *   [fetchStart, "loading"],
 *   [fetchSuccess, "success"],
 *   [fetchError, "error"],
 *   [reset, "idle"]
 * ], "idle");
 *
 * @example
 * // Modal state
 * const modalState = E.mapMerge([
 *   [openModal, "open"],
 *   [closeModal, "closed"],
 *   [minimizeModal, "minimized"]
 * ], "closed");
 */
export function mapMerge<A>(
  transitions: Array<[Event<any>, A]>,
  initial: A,
): Reactive<A> {
  if (transitions.length === 0) {
    return R.of(initial);
  }

  const mappedEvents = transitions.map(([event, value]) =>
    E.map(event, () => value)
  );

  return E.stepper(E.mergeAll(mappedEvents), initial);
}
