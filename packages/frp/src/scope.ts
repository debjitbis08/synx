import type { Event } from "./event";
import type { Reactive } from "./reactive";

type CleanupFn = () => void;

export type ScopeTracker = {
  trackEvent: <A>(ev: Event<A>) => Event<A>;
  trackReactive: <A>(reactive: Reactive<A>) => Reactive<A>;
  trackDisposer: (dispose: CleanupFn) => CleanupFn;
};

let currentScopeTracker: ScopeTracker | null = null;

export function runWithScopeTracker<T>(
  tracker: ScopeTracker,
  fn: () => T
): T {
  const previous = currentScopeTracker;
  currentScopeTracker = tracker;
  try {
    return fn();
  } finally {
    currentScopeTracker = previous;
  }
}

export function trackEventInCurrentScope<A>(ev: Event<A>): Event<A> {
  return currentScopeTracker ? currentScopeTracker.trackEvent(ev) : ev;
}

export function trackReactiveInCurrentScope<A>(
  reactive: Reactive<A>
): Reactive<A> {
  return currentScopeTracker
    ? currentScopeTracker.trackReactive(reactive)
    : reactive;
}

export function trackDisposerInCurrentScope(dispose: CleanupFn): CleanupFn {
  return currentScopeTracker
    ? currentScopeTracker.trackDisposer(dispose)
    : dispose;
}

