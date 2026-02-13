import type { Event } from "@synx/frp/event";
import * as E from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";
import * as R from "@synx/frp/reactive";
import { trackReactiveInCurrentScope } from "./lifecycle";

/**
 * Extract the value from input/textarea/select events.
 * Common pattern for tracking form input values.
 *
 * @example
 * const inputEvent = on(textInput, "input");
 * const valueEvent = targetValue(inputEvent);
 * // valueEvent fires with the string value whenever input changes
 */
export function targetValue<T extends InputEvent | globalThis.Event>(
  event: Event<T>
): Event<string> {
  return E.map(event, (e) => (e.target as HTMLInputElement).value);
}

/**
 * Extract the checked state from checkbox/radio events.
 * Common pattern for tracking checkbox/radio button state.
 *
 * @example
 * const changeEvent = on(checkbox, "change");
 * const checkedEvent = targetChecked(changeEvent);
 * // checkedEvent fires with boolean whenever checkbox changes
 */
export function targetChecked<T extends InputEvent | globalThis.Event>(
  event: Event<T>
): Event<boolean> {
  return E.map(event, (e) => (e.target as HTMLInputElement).checked);
}

/**
 * Extract a specific property from the event target.
 * Generic helper for accessing any property on the target element.
 *
 * @example
 * const scrollEvent = on(element, "scroll");
 * const scrollTop = targetProperty(scrollEvent, "scrollTop");
 */
export function targetProperty<
  T extends globalThis.Event,
  K extends keyof HTMLElement,
>(event: Event<T>, property: K): Event<HTMLElement[K]> {
  return E.map(event, (e) => (e.target as HTMLElement)[property]);
}

/**
 * Extract data attributes from the event target.
 *
 * @example
 * const clickEvent = on(button, "click");
 * const userId = targetData(clickEvent, "userId");
 * // Reads data-user-id attribute
 */
export function targetData<T extends globalThis.Event>(
  event: Event<T>,
  dataKey: string
): Event<string | null> {
  return E.map(event, (e) => {
    const target = e.target as HTMLElement;
    return target.dataset[dataKey] ?? null;
  });
}

/**
 * Reactive wrapper around `window.matchMedia`.
 * Emits whenever the media query match status changes.
 *
 * @example
 * const prefersDark = mediaQueryMatches("(prefers-color-scheme: dark)");
 */
export function mediaQueryMatches(
  query: string | MediaQueryList
): Reactive<boolean> {
  const mediaQuery = typeof query === "string" ? window.matchMedia(query) : query;
  const [changed, emitChanged] = E.create<boolean>();

  const onChange = (event: MediaQueryListEvent) => {
    emitChanged(event.matches);
  };

  mediaQuery.addEventListener("change", onChange);

  const matches = E.stepper(changed, mediaQuery.matches);
  R.onCleanup(matches, () => {
    mediaQuery.removeEventListener("change", onChange);
    E.cleanup(changed);
  });

  return trackReactiveInCurrentScope(matches);
}
