import type { Reactive } from './reactive';
import { map } from './reactive';

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
