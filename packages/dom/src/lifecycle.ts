import type { Event } from "@synx/frp/event";
import * as E from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";
import * as R from "@synx/frp/reactive";
import {
  runWithScopeTracker,
  trackDisposerInCurrentScope as trackDisposerInFrpScope,
  trackEventInCurrentScope as trackEventInFrpScope,
  trackReactiveInCurrentScope as trackReactiveInFrpScope,
  type ScopeTracker,
} from "@synx/frp/scope";

type CleanupFn = () => void;

export type AutoCleanupOptions = {
  root?: Node;
  events?: ReadonlyArray<Event<any>>;
  reactives?: ReadonlyArray<Reactive<any>>;
  disposers?: ReadonlyArray<CleanupFn>;
};

export type Scope = {
  run: <T>(fn: () => T) => T;
  event: <A>(ev: Event<A>) => Event<A>;
  reactive: <A>(reactive: Reactive<A>) => Reactive<A>;
  use: (dispose: CleanupFn) => CleanupFn;
  dispose: () => void;
};

type ScopeImpl = {
  tracker: ScopeTracker;
} & Scope;

export function trackEventInCurrentScope<A>(ev: Event<A>): Event<A> {
  return trackEventInFrpScope(ev);
}

export function trackReactiveInCurrentScope<A>(reactive: Reactive<A>): Reactive<A> {
  return trackReactiveInFrpScope(reactive);
}

export function trackDisposerInCurrentScope(dispose: CleanupFn): CleanupFn {
  return trackDisposerInFrpScope(dispose);
}

export function createScope(options: { root?: Node } = {}): Scope {
  const events = new Set<Event<any>>();
  const reactives = new Set<Reactive<any>>();
  const disposers = new Set<CleanupFn>();
  const root = options.root;

  let disposed = false;
  let observer: MutationObserver | null = null;

  const scope: ScopeImpl = {
    run: <T>(fn: () => T): T => {
      return runWithScopeTracker(scope.tracker, fn);
    },
    tracker: {
      trackEvent: <A>(ev: Event<A>): Event<A> => {
        events.add(ev);
        return ev;
      },
      trackReactive: <A>(reactive: Reactive<A>): Reactive<A> => {
        reactives.add(reactive);
        return reactive;
      },
      trackDisposer: (dispose: CleanupFn): CleanupFn => {
        disposers.add(dispose);
        return dispose;
      },
    },
    event: <A>(ev: Event<A>): Event<A> => scope.tracker.trackEvent(ev),
    reactive: <A>(reactive: Reactive<A>): Reactive<A> =>
      scope.tracker.trackReactive(reactive),
    use: (dispose: CleanupFn): CleanupFn => scope.tracker.trackDisposer(dispose),
    dispose: () => {
      if (disposed) return;
      disposed = true;

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      window.removeEventListener("beforeunload", scope.dispose);

      for (const stop of disposers) stop();
      for (const ev of events) E.cleanup(ev);
      for (const reactive of reactives) R.cleanup(reactive);

      disposers.clear();
      events.clear();
      reactives.clear();
    },
  };

  if (root) {
    observer = new MutationObserver(() => {
      if (!root.isConnected) scope.dispose();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.addEventListener("beforeunload", scope.dispose);

  return scope;
}

export function autoCleanup(options: AutoCleanupOptions): CleanupFn {
  const scope = createScope({ root: options.root });
  if (options.events) {
    for (const ev of options.events) scope.event(ev);
  }
  if (options.reactives) {
    for (const reactive of options.reactives) scope.reactive(reactive);
  }
  if (options.disposers) {
    for (const dispose of options.disposers) scope.use(dispose);
  }
  return scope.dispose;
}
