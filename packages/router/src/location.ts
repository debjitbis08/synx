import * as E from '@synx/frp/event';
import * as R from '@synx/frp/reactive';
import type { Reactive } from '@synx/frp/reactive';
import type {
  NavigateOptions,
  NavigateTo,
  RouterLocation,
  RouterMode,
  RouterOptions,
} from './types';

/**
 * Layer 1 — the URL as a source, plus navigation as the sink. This is the
 * irreducible primitive (think `E.create()` returning `[event, emit]`):
 * `url` is a Reactive you transform with map/fold/switch like any other
 * reactive; `navigate`/`push`/`replace` are how you emit into it.
 *
 * The core router is just this. Matching (matchPath/matchRoutes) and rendering
 * (@synx/router/view) are things you compose on top — not built in.
 */
export interface Location {
  /** The current location as a reactive source. */
  url: Reactive<RouterLocation>;
  /** Push or replace depending on `options.replace`. */
  navigate(to: NavigateTo, options?: NavigateOptions): void;
  /** Push a new history entry. */
  push(to: NavigateTo, options?: Omit<NavigateOptions, 'replace'>): void;
  /** Replace the current history entry. */
  replace(to: NavigateTo, options?: Omit<NavigateOptions, 'replace'>): void;
  /** Resolve a NavigateTo to the href string this would navigate to. */
  href(to: NavigateTo): string;
  go(delta: number): void;
  back(): void;
  forward(): void;
  /** Remove listeners and tear down the reactive. */
  dispose(): void;
}

/** Normalize a base path: "" or "/" -> "", "/app/" -> "/app". */
function normalizeBase(base: string | undefined): string {
  if (!base || base === '/') return '';
  let b = base.startsWith('/') ? base : '/' + base;
  if (b.endsWith('/')) b = b.slice(0, -1);
  return b;
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : '/' + path;
}

/** Remove the base prefix from a pathname; result always starts with "/". */
function stripBase(pathname: string, base: string): string {
  if (base && (pathname === base || pathname.startsWith(base + '/'))) {
    const rest = pathname.slice(base.length);
    return rest === '' ? '/' : rest;
  }
  return ensureLeadingSlash(pathname);
}

/** base + path, collapsing duplicate slashes at the seam. */
function joinPath(base: string, path: string): string {
  return base + ensureLeadingSlash(path);
}

interface ParsedPath {
  pathname: string;
  search: string;
  hash: string;
}

/** Parse a route-path string ("/users/1?q=2#x") into its parts. */
function parsePathString(s: string): ParsedPath {
  // A dummy origin lets the URL parser do the splitting for us.
  const url = new URL(ensureLeadingSlash(s), 'http://x');
  return { pathname: url.pathname, search: url.search, hash: url.hash };
}

/** Turn a NavigateTo into normalized {pathname, search, hash}. */
function normalizeTo(to: NavigateTo, currentPathname: string): ParsedPath {
  if (typeof to === 'string') {
    return parsePathString(to);
  }
  if (to instanceof URL) {
    return { pathname: to.pathname, search: to.search, hash: to.hash };
  }
  const pathname = ensureLeadingSlash(to.pathname ?? currentPathname);
  let search = '';
  if (to.searchParams !== undefined) {
    const params =
      to.searchParams instanceof URLSearchParams
        ? to.searchParams
        : new URLSearchParams(
            Object.entries(to.searchParams).map(([k, v]) => [k, String(v)]),
          );
    const qs = params.toString();
    search = qs ? '?' + qs : '';
  } else if (to.search) {
    search = to.search.startsWith('?') ? to.search : '?' + to.search;
  }
  let hash = '';
  if (to.hash) hash = to.hash.startsWith('#') ? to.hash : '#' + to.hash;
  return { pathname, search, hash };
}

export function location(opts: RouterOptions = {}): Location {
  const mode: RouterMode = opts.mode ?? 'history';
  const base = normalizeBase(opts.base);

  const read = (): RouterLocation => {
    if (mode === 'hash') {
      const raw = window.location.hash.slice(1) || '/';
      const parsed = parsePathString(raw);
      return {
        pathname: stripBase(parsed.pathname, base),
        search: parsed.search,
        hash: '',
        state: window.history.state,
      };
    }
    return {
      pathname: stripBase(window.location.pathname, base),
      search: window.location.search,
      hash: window.location.hash,
      state: window.history.state,
    };
  };

  const href = (to: NavigateTo): string => {
    const norm = normalizeTo(to, read().pathname);
    const routePath = joinPath(base, norm.pathname);
    if (mode === 'hash') {
      // Keep the page path; the route lives entirely in the fragment.
      return '#' + routePath + norm.search;
    }
    return routePath + norm.search + norm.hash;
  };

  const [changed, emitChanged] = E.create<RouterLocation>();
  const url = E.stepper(changed, read());

  let lastHref = window.location.href;
  const emitCurrent = () => {
    // Dedupe: our own pushState plus a listener can both fire for one change.
    if (window.location.href === lastHref) return;
    lastHref = window.location.href;
    emitChanged(read());
  };

  const navigate = (to: NavigateTo, options: NavigateOptions = {}) => {
    const target = href(to);
    const state =
      options.state !== undefined ? options.state : window.history.state;
    if (options.replace) {
      window.history.replaceState(state, '', target);
    } else {
      window.history.pushState(state, '', target);
    }
    // pushState/replaceState never fire popstate/hashchange, so emit manually.
    lastHref = window.location.href;
    emitChanged(read());
  };

  // Back/forward come through popstate. Fragment changes the router didn't
  // initiate — a native `<a href="#x">`, `location.hash = ...`, or back/forward
  // across hash-only entries — fire hashchange, NOT popstate. We listen in both
  // modes: in hash mode the fragment IS the route; in history mode the fragment
  // is an in-page axis (path picks the page, hash picks a section within it).
  // emitCurrent's href-dedupe collapses any double-fire from our own navigate.
  const onPopState = () => emitCurrent();
  const onHashChange = () => emitCurrent();

  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onHashChange);

  R.onCleanup(url, () => {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('hashchange', onHashChange);
    E.cleanup(changed);
  });

  return {
    url,
    navigate,
    push: (to, options) => navigate(to, { ...options, replace: false }),
    replace: (to, options) => navigate(to, { ...options, replace: true }),
    href,
    go: (delta: number) => window.history.go(delta),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    dispose: () => R.cleanup(url),
  };
}
