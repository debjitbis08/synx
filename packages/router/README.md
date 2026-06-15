# @synx/router

> Routing is not a framework you configure — it's a **source you transform**.
> The URL is a `Reactive` (like a click is an `Event`); matching and rendering
> are just `map`/`fold`/`switch` on top.

There is no `createRouter(routes)` god-object. Instead the package is a stack of
small pieces, each usable on its own and composing into the next. You opt into
exactly the abstraction level you need.

## The layers

### Layer 1 — the URL as a source (`@synx/frp` only)

`location()` is the irreducible primitive, the routing analogue of
`E.create()` returning `[event, emit]`: `url` is the source, `navigate` is how
you emit into it.

```ts
import { location } from '@synx/router';
import * as R from '@synx/frp/reactive';

const loc = location();              // { url, navigate, push, replace, back, forward, go, href, dispose }

R.subscribe(loc.url, (u) => console.log(u.pathname));
loc.push('/users/42');               // emit a new value into the source
```

`loc.url` is a `Reactive<RouterLocation>` (`{ pathname, search, hash, state }`,
base-stripped). Options: `location({ mode: 'history' | 'hash', base: '/app' })`.

That's the whole core. With just this you can route by hand — patch existing
DOM on `url` changes (Alpine-style), build your own matching, whatever.

### Layer 2 — pure pattern matching

The syntax is the platform's [`URLPattern`](https://developer.mozilla.org/docs/Web/API/URLPattern)
pathname syntax. When the browser provides `URLPattern`, `matchPath` delegates
to it — so regex groups and optionals work for free. Where it's absent (older
browsers, Node < 23, jsdom) a `:param` / `*` subset is matched directly.

```ts
import { matchPath } from '@synx/router';

matchPath('/users/:id',      '/users/42');  // { id: '42' }
matchPath('/files/*',        '/files/a/b'); // { '*': 'a/b' }
matchPath('/users',          '/users/42');  // null  (must consume the whole path)
matchPath('/users/:id(\\d+)', '/users/42'); // { id: '42' } — needs native URLPattern
```

Combine the two layers — deriving params is just mapping the source, exactly
like mapping a click event:

```ts
const id = R.map(loc.url, (u) => matchPath('/users/:id', u.pathname)?.id);
```

### Layer 3 — typed / validated params (opt-in)

A param parser is **either** a `(raw: string) => T` function (throw to reject)
**or** any [Standard Schema](https://standardschema.dev) — the `~standard`
interface implemented by Zod 3.24+, Valibot, and ArkType. No dependency on any
validation library. A rejecting parser makes the route *not match*, so
validation doubles as a routing discriminator. (Used by route tables, below.)

### Layer 4 — nested route tables (pure)

`Route` is **data only** — `{ path, name?, parse?, children? }`. No components,
no rendering.

```ts
import { matchRoutes } from '@synx/router';
import { z } from 'zod';

const routes = [
  { path: '', name: 'home' },
  { path: 'users/:id', name: 'user', parse: { id: z.coerce.number().int() } },
  {
    path: 'dashboard', name: 'dash',
    children: [
      { path: '',      name: 'overview' }, // index — matches /dashboard
      { path: 'stats', name: 'stats' },
    ],
  },
];

matchRoutes(routes, '/users/42');
// { matches: [{ route: {name:'user'}, params: {id:42} }], params: {id:42}, pathname: '/users/42' }
```

A route with `children` matches only via one of those children — add an index
child `{ path: '' }` to match the parent's exact path. Patterns: `static`,
`:param`, `*` (captures the rest as `params['*']`).

### Layer 5 — reactive glue (you write it)

There's nothing to import; you compose Layer 1 + Layer 4 with `R.map`:

```ts
const route  = R.map(loc.url, (u) => matchRoutes(routes, u.pathname));
const params = R.map(route, (m) => m?.params ?? {});
```

A **redirect** is just a subscription:

```ts
R.subscribe(loc.url, (u) => { if (u.pathname === '/') loc.replace('/home'); });
```

### Layer 6 — DOM (`@synx/router/view`, needs `@synx/dom`)

Two small helpers; rendering routes is composition, not magic outlets.

```ts
import { view, link } from '@synx/router/view';
import { div, nav } from '@synx/dom/tags';

// `view` swaps a single node based on a reactive — you map the route to a node:
const node = R.map(route, (m) => renderFor(m)); // returns Node | [Node, cleanup] | null

const app = div({},
  nav({},
    link(loc, { to: '/', activeClass: 'active', exact: true }, 'Home'),
    link(loc, { to: '/users/42', activeClass: 'active' }, 'User 42'),
  ),
  view(node), // current route's node renders here, swapping on navigation
);
document.body.appendChild(app);
```

**Nesting** is just nesting another `view` inside a rendered node — render the
layout, and put a `view` over the child route's reactive where the child goes.

`link(loc, props, ...children)` builds an `<a>` whose plain left-click maps to
`loc.navigate` (modified/middle clicks and external `target`s fall through to
the browser). `props`: `{ to, replace?, class?, activeClass?, exact?, target? }`.

## API summary

| Layer | Import from              | Pieces                                                            |
| ----- | ------------------------ | ---------------------------------------------------------------- |
| 1     | `@synx/router`           | `location()` → `{ url, navigate, push, replace, back, forward, go, href, dispose }` |
| 2     | `@synx/router`           | `matchPath(pattern, pathname)`, `toSegments(pathname)`           |
| 3     | `@synx/router`           | `parseParams`, `runParser`, `ParamParser`, `StandardSchemaV1`    |
| 4     | `@synx/router`           | `matchRoutes(routes, pathname)`, `Route`, `RouteMatch`           |
| 5     | — (compose with `@synx/frp`) | `R.map(loc.url, …)`                                          |
| 6     | `@synx/router/view`      | `view(reactiveNode)`, `link(loc, props, …)`                      |

A `NavigateTo` mirrors the browser's own units — a URL string
(`'/users/42?tab=posts'`), a native `URL`, or a descriptor whose field names
match `window.location`: `{ pathname?, search?, searchParams?, hash?, state? }`
(`searchParams` accepts a `URLSearchParams` or a plain record).

## How this honors Pattern #1 ("rely on existing DOM/browser patterns")

The router tracks the platform rather than wrapping it in new abstractions:

| Piece | Platform API it mirrors |
| --- | --- |
| `RouterLocation { pathname, search, hash, state }` | `window.location` + `history.state` (same field names) |
| `loc.url` source | real `popstate` / `hashchange` events |
| `navigate` / `push` / `replace` | `history.pushState` / `replaceState` |
| `back` / `forward` / `go` | the History API, 1:1 |
| `href` | an anchor's `.href` |
| `matchPath` syntax & engine | `URLPattern` (native when available, subset fallback otherwise) |
| query handling | native `URLSearchParams` |
| `NavigateTo` | a URL string, a `URL`, or `window.location`-shaped fields |
| `view` / `link` | real `Node`s + a real `<a>` with native click/modifier/`target` semantics |

The one Synx-level abstraction is the **nested route table** (`matchRoutes`) —
trees of patterns with typed params — because the platform has no equivalent.
It still uses `URLPattern`-compatible `:param` / `*` segment syntax.
