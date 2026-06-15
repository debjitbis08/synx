import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as R from '@synx/frp/reactive';
import { location } from './location';
import { matchRoutes } from './match';
import { view, link } from './view';
import type { Location } from './location';
import type { Route, RouteMatch } from './types';

let loc: Location | null = null;
let container: HTMLElement;
let stop: (() => void) | null = null;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  stop?.();
  stop = null;
  loc?.dispose();
  loc = null;
  container.remove();
});

const routes: Route[] = [
  { path: '', name: 'home' },
  { path: 'about', name: 'about' },
];

function render(m: RouteMatch | null): Node | null {
  const name = m?.matches.at(-1)?.route.name;
  if (!name) return null;
  const el = document.createElement('div');
  el.className = name;
  el.textContent = name;
  return el;
}

describe('view (Layer 6 — single-node swap)', () => {
  it('renders the current node and swaps on navigation', () => {
    loc = location();
    const node = R.map(loc.url, (u) => render(matchRoutes(routes, u.pathname)));
    stop = view(node)(container);

    expect(container.querySelector('.home')).not.toBeNull();
    expect(container.querySelector('.about')).toBeNull();

    loc.push('/about');
    expect(container.querySelector('.home')).toBeNull();
    expect(container.querySelector('.about')?.textContent).toBe('about');
  });

  it('renders nothing for a null value', () => {
    loc = location();
    const node = R.map(loc.url, (u) =>
      u.pathname === '/about' ? render(matchRoutes(routes, u.pathname)) : null,
    );
    stop = view(node)(container);
    expect(container.querySelector('.about')).toBeNull();
    loc.push('/about');
    expect(container.querySelector('.about')).not.toBeNull();
  });

  it('disposes the previous node on swap', () => {
    loc = location();
    let disposed = 0;
    const node = R.map(loc.url, (u): Node | readonly [Node, () => void] => {
      const el = document.createElement('span');
      el.textContent = u.pathname;
      return [el, () => disposed++];
    });
    stop = view(node)(container);

    loc.push('/a');
    loc.push('/b');
    expect(disposed).toBe(2); // initial + /a disposed as /a + /b mounted
    expect(container.querySelector('span')?.textContent).toBe('/b');
  });
});

describe('link', () => {
  it('renders an anchor that navigates on plain click', () => {
    loc = location();
    const el = link(loc, { to: '/about', class: 'nav', activeClass: 'active' }, 'About');
    container.appendChild(el);

    expect(el.getAttribute('href')).toBe('/about');
    expect(el.textContent).toBe('About');
    expect(el.classList.contains('nav')).toBe(true);
    expect(el.classList.contains('active')).toBe(false);

    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );

    expect(window.location.pathname).toBe('/about');
    expect(el.classList.contains('active')).toBe(true);
  });

  it('ignores modified clicks (lets the browser handle them)', () => {
    loc = location();
    const el = link(loc, { to: '/about' }, 'About');
    container.appendChild(el);

    el.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        metaKey: true,
      }),
    );
    expect(window.location.pathname).toBe('/');
  });
});
