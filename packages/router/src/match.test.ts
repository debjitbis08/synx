import { describe, it, expect } from 'vitest';
import { matchPath, matchRoutes, toSegments } from './match';
import type { Route } from './types';
import type { StandardSchemaV1 } from './standard-schema';

describe('toSegments', () => {
  it('splits and decodes, dropping empties', () => {
    expect(toSegments('/')).toEqual([]);
    expect(toSegments('/users/42')).toEqual(['users', '42']);
    expect(toSegments('//a//b/')).toEqual(['a', 'b']);
    expect(toSegments('/hello%20world')).toEqual(['hello world']);
  });
});

describe('matchPath (Layer 2 — single pattern)', () => {
  it('matches a static + param pattern, returning string params', () => {
    expect(matchPath('/users/:id', '/users/42')).toEqual({ id: '42' });
  });

  it('requires the pattern to consume the whole path', () => {
    expect(matchPath('/users', '/users/42')).toBeNull();
    expect(matchPath('/users/:id', '/users')).toBeNull();
  });

  it('matches the root pattern', () => {
    expect(matchPath('/', '/')).toEqual({});
    expect(matchPath('', '/')).toEqual({});
  });

  it('captures a wildcard as "*"', () => {
    expect(matchPath('/files/*', '/files/a/b/c.txt')).toEqual({
      '*': 'a/b/c.txt',
    });
  });

  it('returns null on a static mismatch', () => {
    expect(matchPath('/users', '/posts')).toBeNull();
  });

  // Pattern #1: delegate to the platform's URLPattern when present.
  const hasURLPattern =
    typeof (globalThis as { URLPattern?: unknown }).URLPattern === 'function';

  it.runIf(hasURLPattern)('supports regex groups via native URLPattern', () => {
    expect(matchPath('/users/:id(\\d+)', '/users/42')).toEqual({ id: '42' });
    expect(matchPath('/users/:id(\\d+)', '/users/abc')).toBeNull();
  });

  it.skipIf(hasURLPattern)(
    'falls back to the :param / * subset when URLPattern is absent',
    () => {
      // The fallback understands :param and *, not regex groups — this is the
      // documented subset (current Node/jsdom test environment).
      expect(matchPath('/users/:id', '/users/42')).toEqual({ id: '42' });
      expect(matchPath('/files/*', '/files/a/b')).toEqual({ '*': 'a/b' });
    },
  );
});

describe('matchRoutes (Layer 4 — flat)', () => {
  it('matches a single route and returns the chain', () => {
    const routes: Route[] = [{ path: 'users/:id', name: 'user' }];
    const m = matchRoutes(routes, '/users/42');
    expect(m).not.toBeNull();
    expect(m!.matches).toHaveLength(1);
    expect(m!.params).toEqual({ id: '42' });
  });

  it('returns null when nothing matches or extra segments remain', () => {
    const routes: Route[] = [{ path: 'users', name: 'users' }];
    expect(matchRoutes(routes, '/posts')).toBeNull();
    expect(matchRoutes(routes, '/users/42')).toBeNull();
  });

  it('honors declaration order, first full match wins', () => {
    const routes: Route[] = [
      { path: 'users/new', name: 'new' },
      { path: 'users/:id', name: 'detail' },
    ];
    expect(matchRoutes(routes, '/users/new')!.matches[0].route.name).toBe('new');
    expect(matchRoutes(routes, '/users/7')!.matches[0].route.name).toBe('detail');
  });
});

describe('matchRoutes (Layer 4 — nested)', () => {
  const routes: Route[] = [
    {
      path: 'dashboard',
      name: 'dash',
      children: [
        { path: '', name: 'home' },
        { path: 'stats', name: 'stats' },
        { path: 'users/:id', name: 'user' },
      ],
    },
  ];

  it('matches an index child for the parent path', () => {
    const m = matchRoutes(routes, '/dashboard');
    expect(m!.matches.map((x) => x.route.name)).toEqual(['dash', 'home']);
  });

  it('matches a deeper child and merges params', () => {
    const m = matchRoutes(routes, '/dashboard/users/9');
    expect(m!.matches).toHaveLength(2);
    expect(m!.matches[1].route.name).toBe('user');
    expect(m!.params).toEqual({ id: '9' });
  });

  it('returns null for an unmatched child segment', () => {
    expect(matchRoutes(routes, '/dashboard/missing/x')).toBeNull();
  });

  it('does NOT match a parent with children but no index child', () => {
    const r: Route[] = [{ path: 'a', children: [{ path: 'b', name: 'b' }] }];
    expect(matchRoutes(r, '/a')).toBeNull();
    expect(matchRoutes(r, '/a/b')!.matches[1].route.name).toBe('b');
  });
});

describe('matchRoutes (Layer 3 — typed params)', () => {
  const intParser = (raw: string) => {
    const n = Number(raw);
    if (!Number.isInteger(n)) throw new Error('not an int');
    return n;
  };

  it('coerces with a function parser', () => {
    const routes: Route[] = [{ path: 'users/:id', parse: { id: intParser } }];
    const m = matchRoutes(routes, '/users/42');
    expect(m!.params.id).toBe(42);
    expect(typeof m!.params.id).toBe('number');
  });

  it('backtracks to the next route when a typed param rejects', () => {
    const routes: Route[] = [
      { path: 'users/:id', name: 'num', parse: { id: intParser } },
      { path: 'users/:slug', name: 'slug' },
    ];
    expect(matchRoutes(routes, '/users/42')!.matches[0].route.name).toBe('num');
    const slug = matchRoutes(routes, '/users/abc');
    expect(slug!.matches[0].route.name).toBe('slug');
    expect(slug!.params).toEqual({ slug: 'abc' });
  });

  it('supports a Standard Schema validator (no library dependency)', () => {
    const positiveInt: StandardSchemaV1<string, number> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          const n = Number(value);
          if (Number.isInteger(n) && n > 0) return { value: n };
          return { issues: [{ message: 'expected positive integer' }] };
        },
      },
    };
    const routes: Route[] = [
      { path: 'p/:page', name: 'paged', parse: { page: positiveInt } },
      { path: 'p/:slug', name: 'slug' },
    ];
    expect(matchRoutes(routes, '/p/3')!.matches[0].route.name).toBe('paged');
    expect(matchRoutes(routes, '/p/3')!.params.page).toBe(3);
    expect(matchRoutes(routes, '/p/0')!.matches[0].route.name).toBe('slug');
  });
});
