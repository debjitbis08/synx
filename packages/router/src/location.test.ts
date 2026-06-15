import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as R from '@synx/frp/reactive';
import { subscribe } from '@synx/frp/event';
import { location } from './location';
import { matchRoutes } from './match';
import type { Location } from './location';
import type { Route } from './types';

let loc: Location | null = null;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  loc?.dispose();
  loc = null;
});

describe('location (Layer 1 — the URL as a source)', () => {
  it('exposes the initial url', () => {
    window.history.replaceState(null, '', '/users/1?q=x');
    loc = location();
    const u = R.get(loc.url);
    expect(u.pathname).toBe('/users/1');
    expect(u.search).toBe('?q=x');
  });

  it('push updates the url reactive (emits to subscribers)', () => {
    loc = location();
    const seen: string[] = [];
    subscribe(loc.url.changes, (u) => seen.push(u.pathname));

    loc.push('/users/5');
    expect(window.location.pathname).toBe('/users/5');
    expect(R.get(loc.url).pathname).toBe('/users/5');
    expect(seen).toContain('/users/5');
  });

  it('replace does not grow history length', () => {
    loc = location();
    const before = window.history.length;
    loc.replace('/users/9');
    expect(window.location.pathname).toBe('/users/9');
    expect(window.history.length).toBe(before);
  });

  it('navigates from a descriptor using DOM field names (pathname/searchParams)', () => {
    loc = location();
    loc.push({ pathname: '/search', searchParams: { q: 'box', n: 3 } });
    expect(window.location.pathname).toBe('/search');
    const u = R.get(loc.url);
    expect(new URLSearchParams(u.search).get('n')).toBe('3');
  });

  it('accepts a native URL object', () => {
    loc = location();
    loc.push(new URL('http://x/users/7?tab=posts'));
    expect(window.location.pathname).toBe('/users/7');
    expect(R.get(loc.url).search).toBe('?tab=posts');
  });

  it('accepts a raw search string and URLSearchParams', () => {
    loc = location();
    loc.push({ pathname: '/s', search: 'a=1' });
    expect(R.get(loc.url).search).toBe('?a=1');
    loc.push({ pathname: '/s', searchParams: new URLSearchParams({ b: '2' }) });
    expect(R.get(loc.url).search).toBe('?b=2');
  });

  it('resolves hrefs', () => {
    loc = location();
    expect(loc.href('/users/8')).toBe('/users/8');
    expect(loc.href({ pathname: '/s', searchParams: { q: 'a' } })).toBe('/s?q=a');
  });

  it('re-emits on a native hash-only change (path + hash as separate axes)', () => {
    loc = location();
    loc.push('/docs/api');
    const seen: string[] = [];
    subscribe(loc.url.changes, (u) => seen.push(u.hash));

    // Simulate a native `<a href="#install">` click / `location.hash = ...`:
    // the fragment moves but the path does not, firing hashchange (not popstate).
    window.history.replaceState(null, '', '/docs/api#install');
    window.dispatchEvent(new Event('hashchange'));

    const u = R.get(loc.url);
    expect(u.pathname).toBe('/docs/api'); // page unchanged
    expect(u.hash).toBe('#install'); // in-page section tracked
    expect(seen).toContain('#install');
  });
});

describe('location — composing matching on top (Layer 1 + 4)', () => {
  const routes: Route[] = [
    { path: '', name: 'home' },
    { path: 'users/:id', name: 'user' },
  ];

  it('derives a reactive match with R.map, exactly like mapping a click', () => {
    loc = location();
    const route = R.map(loc.url, (u) => matchRoutes(routes, u.pathname));
    const params = R.map(route, (m) => m?.params ?? {});

    expect(R.get(route)!.matches[0].route.name).toBe('home');

    loc.push('/users/5');
    expect(R.get(route)!.matches[0].route.name).toBe('user');
    expect(R.get(params)).toEqual({ id: '5' });
  });

  it('a redirect is just subscribe + replace', () => {
    loc = location();
    // "/" redirects to "/home"
    subscribe(loc.url.changes, (u) => {
      if (u.pathname === '/') loc!.replace('/home');
    });
    loc.push('/');
    expect(window.location.pathname).toBe('/home');
  });
});

describe('location — hash mode', () => {
  it('reads and writes the route from the fragment', () => {
    window.history.replaceState(null, '', '/');
    loc = location({ mode: 'hash' });
    loc.push('/users/3');
    expect(window.location.hash).toBe('#/users/3');
    expect(R.get(loc.url).pathname).toBe('/users/3');
  });

  it('composes hash hrefs', () => {
    loc = location({ mode: 'hash' });
    expect(loc.href('/users/8')).toBe('#/users/8');
  });
});

describe('location — base path', () => {
  it('strips base for the url and re-adds it for navigation', () => {
    window.history.replaceState(null, '', '/app/users/1');
    loc = location({ base: '/app' });
    expect(R.get(loc.url).pathname).toBe('/users/1');

    loc.push('/users/2');
    expect(window.location.pathname).toBe('/app/users/2');
    expect(R.get(loc.url).pathname).toBe('/users/2');
  });
});
