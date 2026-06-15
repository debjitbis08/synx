import type { MatchedRoute, Params, Route, RouteMatch } from './types';
import { parseParams } from './standard-schema';

/** Split a pathname into decoded, non-empty segments. */
export function toSegments(pathname: string): string[] {
  const segs: string[] = [];
  for (const raw of pathname.split('/')) {
    if (raw === '') continue;
    segs.push(safeDecode(raw));
  }
  return segs;
}

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function ensureLeadingSlash(p: string): string {
  return p.startsWith('/') ? p : '/' + p;
}

// --- Native URLPattern (Pattern #1: rely on the platform) --------------------
// matchPath uses the browser's URLPattern when present — same `:param` / `*`
// syntax this package already adopted, plus regex groups and optionals for
// free. When it's absent (older browsers, Node < 23, jsdom) we fall back to the
// segment matcher below, which implements a documented subset: `:param` and `*`.

interface URLPatternLike {
  exec(input: { pathname: string }): {
    pathname: { groups: Record<string, string | undefined> };
  } | null;
}
type URLPatternCtor = new (init: { pathname: string }) => URLPatternLike;

const NativeURLPattern: URLPatternCtor | undefined =
  typeof (globalThis as { URLPattern?: URLPatternCtor }).URLPattern === 'function'
    ? (globalThis as { URLPattern?: URLPatternCtor }).URLPattern
    : undefined;

/**
 * Layer 2 — the tiny matcher. Match a single pattern against a pathname,
 * returning its params or null. The pattern must consume the whole path.
 *
 *   matchPath('/users/:id', '/users/42')   // { id: '42' }
 *   matchPath('/files/*',   '/files/a/b')  // { '*': 'a/b' }
 *   matchPath('/users/:id', '/users')      // null
 *
 * Syntax is URLPattern's pathname syntax. Where the platform provides
 * `URLPattern` this delegates to it (so `'/users/:id(\\d+)'` works); otherwise
 * a `:param` / `*` subset is matched directly. Params are raw strings — coerce
 * them yourself, or use a route table (matchRoutes) with `parse`.
 */
export function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const pat = ensureLeadingSlash(pattern === '' ? '/' : pattern);

  if (NativeURLPattern) {
    let compiled: URLPatternLike | null = null;
    try {
      compiled = new NativeURLPattern({ pathname: pat });
    } catch {
      compiled = null; // not a valid URLPattern → use the fallback below
    }
    if (compiled) {
      const res = compiled.exec({ pathname: ensureLeadingSlash(pathname) });
      if (!res) return null;
      const out: Record<string, string> = {};
      for (const key in res.pathname.groups) {
        const value = res.pathname.groups[key];
        if (value === undefined) continue;
        // URLPattern names the trailing wildcard "0"; expose it as "*" so the
        // native and fallback paths return the same shape.
        out[key === '0' ? '*' : key] = value;
      }
      return out;
    }
  }

  const sm = matchSegments(pattern, toSegments(pathname));
  if (!sm || sm.rest.length > 0) return null;
  return sm.params;
}

// --- Segment matcher (fallback + nested traversal) ---------------------------

interface SegmentMatch {
  params: Record<string, string>;
  rest: string[];
}

/**
 * Consume a (possibly multi-segment) pattern from the front of `segments`,
 * returning the captured `:param` / `*` values and the leftover segments, or
 * null. Used by the matchPath fallback and by matchRoutes for nested prefix
 * consumption — which URLPattern (a whole-path API) doesn't model, so the
 * regex-group syntax is only available through matchPath, not in route tables.
 */
function matchSegments(path: string, segments: string[]): SegmentMatch | null {
  const pattern = path.split('/').filter((s) => s !== '');
  const params: Record<string, string> = {};
  let i = 0;

  for (let p = 0; p < pattern.length; p++) {
    const seg = pattern[p];

    if (seg === '*') {
      params['*'] = segments.slice(i).join('/');
      return { params, rest: [] };
    }

    if (i >= segments.length) return null; // pattern longer than the path

    if (seg.startsWith(':')) {
      params[seg.slice(1)] = segments[i];
      i++;
      continue;
    }

    if (seg !== segments[i]) return null; // static mismatch
    i++;
  }

  return { params, rest: segments.slice(i) };
}

/**
 * Match `segments` against sibling routes, descending into children. Returns
 * the full chain (root → leaf) on success, or null. First route in declaration
 * order that yields a fully-consuming match wins; a route whose typed `parse`
 * rejects is skipped so the matcher can backtrack.
 *
 * Leaf rule: a route with `children` matches only via one of those children
 * (use an index child `{ path: '' }` to match the parent's exact path). A route
 * without children matches only when it consumes the entire remaining path.
 */
function matchChain(routes: Route[], segments: string[]): MatchedRoute[] | null {
  for (const route of routes) {
    const sm = matchSegments(route.path, segments);
    if (!sm) continue;

    const parsed = parseParams(sm.params, route.parse);
    if (parsed === null) continue; // typed param rejected → try next route

    const here: MatchedRoute = { route, params: parsed };

    if (route.children && route.children.length > 0) {
      const childChain = matchChain(route.children, sm.rest);
      if (childChain) return [here, ...childChain];
      continue; // children exist but none matched → not a match here
    }

    if (sm.rest.length === 0) return [here]; // leaf consumes the whole path
  }

  return null;
}

/** Merge the per-route params of a chain into a single object (leaf wins). */
function mergeParams(chain: MatchedRoute[]): Params {
  const merged: Params = {};
  for (const m of chain) Object.assign(merged, m.params);
  return merged;
}

/**
 * Layer 4 — match a nested route table against a pathname. Returns the matched
 * chain with merged params, or null. Uses URLPattern-compatible `:param` / `*`
 * segment matching, plus typed-param parsing and backtracking.
 */
export function matchRoutes(routes: Route[], pathname: string): RouteMatch | null {
  const chain = matchChain(routes, toSegments(pathname));
  if (!chain) return null;
  return { matches: chain, params: mergeParams(chain), pathname };
}
