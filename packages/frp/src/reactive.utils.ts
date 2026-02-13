import type { Reactive } from './reactive';
import { ap, map } from './reactive';

/**
 * Negate a boolean Reactive.
 * Common helper for inverting boolean reactive values.
 *
 * @param r The boolean reactive to negate
 * @returns A reactive with the negated boolean value
 *
 * @example
 * const isHidden = R.not(isVisible);
 * const canSubmit = R.not(isDisabled);
 */
export function not(r: Reactive<boolean>): Reactive<boolean> {
  return map(r, (value) => !value);
}

export function map2<A, B, C>(
  ra: Reactive<A>,
  rb: Reactive<B>,
  fn: (a: A, b: B) => C,
): Reactive<C> {
  return ap(rb, map(ra, (a) => (b: B) => fn(a, b)));
}
