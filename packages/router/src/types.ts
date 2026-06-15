import type { ParamParsers } from './standard-schema';

/** Parsed route params. Values are `string` unless a parser coerced them. */
export type Params = Record<string, unknown>;

/** Parsed query string, exposed as the native URLSearchParams. */
export type Query = URLSearchParams;

/** A normalized view of the current browser location, relative to `base`. */
export interface RouterLocation {
  /** Path without the configured base, always starting with "/". */
  readonly pathname: string;
  /** Raw search string including leading "?", or "". */
  readonly search: string;
  /** Fragment including leading "#", or "". In hash mode this is always "". */
  readonly hash: string;
  /** history.state associated with the entry. */
  readonly state: unknown;
}

/**
 * A navigation target. Mirrors the browser's own units — a URL string, a `URL`
 * object, or a descriptor whose field names match `window.location`
 * (`pathname`/`search`/`hash`). `searchParams` accepts a native
 * `URLSearchParams` (or a plain record for convenience).
 */
export type NavigateTo =
  | string
  | URL
  | {
      pathname?: string;
      /** Raw query string, with or without a leading "?". */
      search?: string;
      /** Query params; takes precedence over `search` when both are given. */
      searchParams?: URLSearchParams | Record<string, string | number | boolean>;
      hash?: string;
      state?: unknown;
    };

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Attach history state to the new entry. */
  state?: unknown;
}

export type RouterMode = 'history' | 'hash';

export interface RouterOptions {
  /** "history" (pushState/popstate) or "hash" (#/path). Default "history". */
  mode?: RouterMode;
  /** Base path stripped before matching and re-added on navigation, e.g. "/app". */
  base?: string;
}

// --- Route tables (Layer 4) --------------------------------------------------
// A route is *data only*. It carries no view/component — rendering is something
// you compose on top with @synx/frp + @synx/dom (see @synx/router/view).

export interface Route {
  /**
   * Path pattern relative to the parent route. Examples:
   *   ""           index route (matches when the parent's path is fully consumed)
   *   "users"      static segment
   *   "users/:id"  multi-segment with a param
   *   "*"          wildcard, captures the remaining path as params["*"]
   */
  path: string;
  /** Optional name for diagnostics / named lookups. */
  name?: string;
  /**
   * Coercion/validation for this route's own params. A rejecting parser makes
   * the route not match, so the matcher backtracks to the next candidate.
   */
  parse?: ParamParsers;
  /** Nested child routes, matched against the remaining path. */
  children?: Route[];
}

/** One matched route in the chain, with its resolved params. */
export interface MatchedRoute {
  route: Route;
  /** Params contributed by this route (after parsing). */
  params: Params;
}

/** Result of matching a pathname against a route tree. */
export interface RouteMatch {
  /** Matched routes from root to leaf. */
  matches: MatchedRoute[];
  /** Merged params across the whole chain. */
  params: Params;
  /** The pathname that produced this match. */
  pathname: string;
}
