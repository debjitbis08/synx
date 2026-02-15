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
  attachRoot: (root: Node) => void;
  dispose: () => void;
};

type ScopeImpl = {
  tracker: ScopeTracker;
} & Scope;

const activeScopes = new Set<ScopeImpl>();
const scopeRoots = new WeakMap<ScopeImpl, Node | undefined>();

let sharedObserver: MutationObserver | null = null;
let sharedBeforeUnloadBound = false;

const hasWindow = typeof window !== "undefined";
const hasDocument = typeof document !== "undefined";

function hasTrackedRoots(): boolean {
  for (const scope of activeScopes) {
    if (scopeRoots.get(scope)) return true;
  }
  return false;
}

function disposeDisconnectedScopes() {
  for (const scope of Array.from(activeScopes)) {
    const root = scopeRoots.get(scope);
    if (root && !root.isConnected) {
      scope.dispose();
    }
  }
}

function ensureSharedBeforeUnload() {
  if (!hasWindow || sharedBeforeUnloadBound) return;
  sharedBeforeUnloadBound = true;
  window.addEventListener("beforeunload", disposeAllScopes);
}

function ensureSharedObserver() {
  if (!hasDocument || sharedObserver) return;
  if (!document.body) return;
  sharedObserver = new MutationObserver(() => {
    disposeDisconnectedScopes();
    maybeTearDownSharedObserver();
  });
  sharedObserver.observe(document.body, { childList: true, subtree: true });
}

function maybeTearDownSharedObserver() {
  if (!sharedObserver) return;
  if (hasTrackedRoots()) return;
  sharedObserver.disconnect();
  sharedObserver = null;
}

function maybeTearDownSharedBeforeUnload() {
  if (!hasWindow || !sharedBeforeUnloadBound) return;
  if (activeScopes.size > 0) return;
  sharedBeforeUnloadBound = false;
  window.removeEventListener("beforeunload", disposeAllScopes);
}

function registerScope(scope: ScopeImpl) {
  activeScopes.add(scope);
  ensureSharedBeforeUnload();
}

function unregisterScope(scope: ScopeImpl) {
  activeScopes.delete(scope);
  scopeRoots.delete(scope);
  maybeTearDownSharedObserver();
  maybeTearDownSharedBeforeUnload();
}

function registerScopeRoot(scope: ScopeImpl, root: Node) {
  scopeRoots.set(scope, root);
  ensureSharedObserver();
}

function clearScopeRoot(scope: ScopeImpl) {
  scopeRoots.delete(scope);
  maybeTearDownSharedObserver();
}

function disposeAllScopes() {
  for (const scope of Array.from(activeScopes)) {
    scope.dispose();
  }
}

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
  let root: Node | undefined = options.root;

  let disposed = false;

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
    attachRoot: (nextRoot: Node): void => {
      if (disposed) return;
      root = nextRoot;
      registerScopeRoot(scope, nextRoot);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;

      clearScopeRoot(scope);
      unregisterScope(scope);

      for (const stop of disposers) stop();
      for (const ev of events) E.cleanup(ev);
      for (const reactive of reactives) R.cleanup(reactive);

      disposers.clear();
      events.clear();
      reactives.clear();
    },
  };

  registerScope(scope);
  if (root) {
    registerScopeRoot(scope, root);
  }

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
