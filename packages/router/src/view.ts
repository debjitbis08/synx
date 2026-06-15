import * as R from '@synx/frp/reactive';
import type { Reactive } from '@synx/frp/reactive';
import { subscribe } from '@synx/frp/event';
import { a } from '@synx/dom/tags';
import type { Child } from '@synx/dom/tags';
import { trackDisposerInCurrentScope } from '@synx/dom/lifecycle';
import type { Location } from './location';
import type { NavigateTo } from './types';

/**
 * Layer 6 — DOM. Two small helpers; rendering routes is composition, not magic.
 *
 * `view` swaps a single node based on a reactive — you map your route reactive
 * to a node yourself:
 *
 *   const route = R.map(loc.url, u => matchRoutes(routes, u.pathname));
 *   div({ id: 'app' }, view(R.map(route, m => renderFor(m))));
 *
 * Nesting is just nesting another `view` inside a rendered node.
 */

/** A node, optionally paired with a disposer, or nothing. */
export type ViewNode = Node | readonly [Node, () => void] | null | undefined;

/**
 * Mount the current node of `node` into a parent, swapping it whenever the
 * reactive changes (disposing the previous one). Returns a mount-function
 * compatible with Synx tag children, so it works inline — `div({}, view(r))` —
 * or standalone: `const stop = view(r)(parent)`.
 */
export function view(
  node: Reactive<ViewNode>,
): (parent: HTMLElement) => () => void {
  return (parent: HTMLElement) => {
    // A stable marker fixes the position; content is inserted before it.
    const marker = document.createComment('synx-view');
    parent.appendChild(marker);

    let current: Node | null = null;
    let dispose: () => void = noop;

    const clear = () => {
      if (current && current.parentNode) current.parentNode.removeChild(current);
      current = null;
      safeDispose(dispose);
      dispose = noop;
    };

    const render = (value: ViewNode) => {
      clear();
      if (value == null) return;
      const n = Array.isArray(value) ? value[0] : (value as Node);
      dispose = Array.isArray(value) ? value[1] : noop;
      parent.insertBefore(n, marker);
      current = n;
    };

    render(R.get(node));
    const stop = subscribe(node.changes, render);

    return trackDisposerInCurrentScope(() => {
      stop();
      clear();
      if (marker.parentNode) marker.parentNode.removeChild(marker);
    });
  };
}

// --- link --------------------------------------------------------------------

export interface LinkProps {
  to: NavigateTo;
  /** Replace the current entry instead of pushing. */
  replace?: boolean;
  /** Base class(es) for the anchor. */
  class?: string;
  /** Class applied while the link's target matches the current location. */
  activeClass?: string;
  /** Active match must equal the full pathname (default: prefix match). */
  exact?: boolean;
  /** Anchor target; "_blank"/external targets bypass client navigation. */
  target?: string;
}

/**
 * An <a> that navigates via `loc` on plain left-clicks (a click event mapped
 * to a navigation), while preserving native behavior for modified clicks,
 * middle-clicks, and external targets. Optionally toggles `activeClass` from
 * `loc.url`.
 */
export function link(
  loc: Location,
  props: LinkProps,
  ...children: Child[]
): HTMLAnchorElement {
  const { to, replace, exact = false, target } = props;

  const classProp: Record<string, boolean | Reactive<boolean>> = {};
  if (props.class) {
    for (const c of props.class.split(/\s+/)) if (c) classProp[c] = true;
  }
  if (props.activeClass) {
    classProp[props.activeClass] = R.map(loc.url, (u) =>
      isActive(targetPathname(to, u.pathname), u.pathname, exact),
    );
  }

  const handleClick = (e: MouseEvent) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return; // left-click only
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== '_self') return;
    e.preventDefault();
    loc.navigate(to, { replace });
  };

  return a(
    {
      href: loc.href(to),
      ...(target ? { target } : {}),
      class: classProp,
      on: { click: handleClick },
    },
    ...children,
  ) as HTMLAnchorElement;
}

function isActive(target: string, current: string, exact: boolean): boolean {
  if (exact) return current === target;
  if (current === target) return true;
  const prefix = target.endsWith('/') ? target : target + '/';
  return current.startsWith(prefix);
}

function targetPathname(to: NavigateTo, fallback: string): string {
  if (typeof to === 'string') {
    const path = to.split('#')[0].split('?')[0];
    return ensureLeadingSlash(path || fallback);
  }
  if (to instanceof URL) return to.pathname;
  return ensureLeadingSlash(to.pathname ?? fallback);
}

function ensureLeadingSlash(p: string): string {
  return p.startsWith('/') ? p : '/' + p;
}

function noop() {}

function safeDispose(dispose: () => void): void {
  try {
    dispose();
  } catch (error) {
    console.error('view cleanup failed', error);
  }
}
